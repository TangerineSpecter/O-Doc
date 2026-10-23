"""按日计划批量执行处置与采购。

直接调用 market_service.trade，不经过工具调用的二十次计数；每笔使用稳定
请求键，单笔失败只记录原因，不回滚已完成动作。
"""
import hashlib
import json
import logging
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent

from .farm_gate import guarded
from .life_budget_policy import remaining_reservation
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_time import storage_time

from .market_disposition import select_rows, surplus_plan
from .market_models import MarketListing, MarketTransaction
from .market_plan_models import MarketGoal, MarketPlan
from .market_plan_candidates import craftable_after_purchase, crafting_input_domain
from .market_service import trade
from .market_shop import current_batch
from .market_sessions import close_session, enter

logger = logging.getLogger(__name__)


def _key(tick_id: str, operation: dict) -> str:
    """按动作内容生成请求键：同一预检重试即便前面动作已消失也复用同一键。"""
    return hashlib.sha256(
        f'market-batch:{tick_id}:{json.dumps(operation, sort_keys=True, default=str)}'.encode()
    ).hexdigest()[:64]


def _unit_price(operation: dict) -> Decimal:
    try:
        return Decimal(str(operation.get('unit_price') or 0))
    except (TypeError, ValueError):
        return Decimal('0')


def _sell_operation(owner: str, actor_id: str, sku: str, quantity: int, star_order: str) -> list[dict]:
    operations = []
    if sku.startswith('combat.material.'):
        from .combat.store import current
        from .combat.models import CombatProfile
        profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
        # 材料目录 ID 形如 material.moss_cave.1，库存 sku 只是多了 combat. 前缀。
        material_id = sku[len('combat.'):]
        catalog = current(profile.catalog_id if profile else None)
        catalog.row('materials', material_id)
        return [{'kind': 'sell_combat_material', 'material_id': material_id, 'quantity': quantity}]
    for row, take in select_rows(owner, actor_id, sku, quantity, star_order):
        operations.append({'kind': 'sell', 'item_id': row.pk, 'quantity': take})
    return operations


def _list_operations(owner: str, actor_id: str, sku: str, quantity: int, star_order: str,
                     unit_price: Decimal, *, skip: int = 0) -> list[dict]:
    operations = []
    for row, take in select_rows(owner, actor_id, sku, quantity, star_order, skip=skip):
        operations.append({'kind': 'list', 'item_id': row.pk, 'quantity': take,
                           'unit_price': str(unit_price)})
    return operations


def _goal_buy(owner: str, actor_id: str, plan: MarketPlan, goal: MarketGoal, now,
              agent=None, crafting_facts: dict | None = None) -> dict | None:
    remain = max(0, goal.quantity - goal.filled_quantity)
    if remain <= 0:
        return None
    if goal.kind == 'shop':
        batch = current_batch(owner, now)
        if goal.sku == 'feed':
            slot = {'id': 'feed', 'price': batch.feed_price, 'remaining_quantity': 1000000}
        else:
            slot = next((row for row in batch.supplies if row.get('sku') == goal.sku), None)
            slot = slot or next((row for row in batch.slots
                         if row.get('sku') == goal.sku and
                         int(row.get('remaining_quantity', 0)) > 0), None)
        if not slot:
            return None
        unit = Decimal(str(slot['price']))
        available = int(slot['remaining_quantity']) if 'remaining_quantity' in slot else remain
        quantity = min(remain, available)
        if goal.sku.startswith('bait.'):
            from .fishing.constants import MAX_BAIT_STOCK
            from .inventory_stock import stock_quantity
            quantity = min(quantity, max(0, MAX_BAIT_STOCK - stock_quantity(actor_id, owner, goal.sku)))
        if quantity < 1 or (goal.max_unit_price and unit > goal.max_unit_price):
            return None
        return {'kind': 'buy_shop', 'batch_id': batch.pk, 'slot_id': slot['id'],
                'quantity': quantity, 'unit_price': str(unit), '_goal': goal.pk}
    rows = MarketListing.objects.filter(owner_id=owner, status='active').exclude(seller_id=actor_id)
    if goal.kind == 'listing':
        rows = rows.filter(item__source__sku=goal.sku)
        rows = rows.filter(item__source__stars__gte=goal.min_stars) if goal.min_stars > 1 else rows
    else:
        # 装备由 tick 层逐件判断“买/永久不买”，这里不直接生成购买动作。
        return None
    candidates = list(rows.order_by('unit_price', 'created_at')[:20])
    cache = crafting_facts if crafting_facts is not None else {}
    buyer = agent
    if goal.kind == 'listing' and crafting_input_domain(goal.sku) and buyer is None:
        from .life_config import owns_actor
        buyer = (Agent.objects.filter(pk=actor_id, archived_at__isnull=True).first()
                 if owns_actor(owner, actor_id) else None)
    for listing in candidates:
        if goal.max_unit_price and listing.unit_price > goal.max_unit_price:
            continue
        quantity = 1 if goal.kind == 'equipment' else min(remain, listing.remaining_quantity)
        if goal.kind == 'listing' and crafting_input_domain(goal.sku):
            if not buyer or not craftable_after_purchase(owner, buyer, goal.sku, quantity, facts_cache=cache):
                continue
        return {'kind': 'buy_listing', 'listing_id': listing.pk, 'version': listing.version,
                'quantity': quantity, 'unit_price': str(listing.unit_price), '_goal': goal.pk}
    return None


def _record_goal(goal_id: str, quantity: int) -> None:
    with transaction.atomic():
        goal = MarketGoal.objects.select_for_update().filter(pk=goal_id).first()
        if not goal:
            return
        goal.filled_quantity = min(goal.quantity, goal.filled_quantity + quantity)
        goal.status = 'filled' if goal.filled_quantity >= goal.quantity else 'open'
        goal.save(update_fields=['filled_quantity', 'status', 'updated_at'])


def _goal_sku(goal_id: str) -> str:
    if not goal_id:
        return ''
    return MarketGoal.objects.filter(pk=goal_id).values_list('sku', flat=True).first() or ''


def _record_farm_purchase(owner: str, actor_id: str, key: str, sku: str, amount) -> None:
    """自动化种子与肥料成交也计入当天种植队列采购上限。"""
    if not sku.startswith(('seed.', 'fertilizer.')):
        return
    from .farm_models import AgentFarm
    from .farm_queue_plan import current, save
    with transaction.atomic():
        farm = AgentFarm.objects.select_for_update().filter(pk=actor_id, owner_id=owner).first()
        plan = current(farm) if farm else None
        if not plan or any(row['id'] == key for row in plan['purchases']):
            return
        plan['purchases'].append({'id': key, 'sku': sku, 'amount': str(Decimal(str(amount)))})
        save(farm)


@guarded
@transaction.atomic
def _purchase(session, agent, plan: MarketPlan, key: str, operation: dict,
              goal_id: str, now) -> dict:
    """交易、实时资金预留检查及计划记账一起提交；重放不重复记账。"""
    agent = Agent.objects.select_for_update().get(pk=agent.pk)
    plan = MarketPlan.objects.select_for_update().get(
        pk=plan.pk, owner_id=session.owner_id, actor_id=agent.pk)
    if MarketTransaction.objects.filter(pk=key).exists():
        return trade(session, agent, key, operation, now)
    reservations = LifeItem.objects.select_for_update().filter(
        owner_id=plan.owner_id, actor_id=agent.pk, status__in=OPEN)
    reserved = sum((remaining_reservation(row) for row in reservations), Decimal(0))
    available = max(Decimal(0), min(plan.budget - plan.spent, agent.money - reserved))
    if _unit_price(operation) * int(operation.get('quantity', 1)) > available:
        raise ValueError('超出当日市场预算或资金已预留给其他生活安排')
    result = trade(session, agent, key, operation, now)
    # 以成交金额而非预检报价记账；价格变化不能突破事务内检查的上限。
    amount = Decimal(result['total'])
    if amount > available:
        raise ValueError('实际成交金额超出当日市场预算或生活可用资金')
    if goal_id:
        _record_goal(goal_id, int(result['quantity']))
    plan.spent += amount
    plan.save(update_fields=['spent', 'updated_at'])
    return result


def execute(owner: str, agent, plan: MarketPlan, tick, actions: dict, now=None) -> dict:
    """actions: {'dispositions':[...], 'goals':[...], 'reprices':[...], 'equipment':[...]}"""
    from .life_config import task_for
    task = task_for(owner, agent, 'market')
    if not task:
        return {'ok': False, 'reason': '没有可用的市场任务'}
    now = now or timezone.now()
    session = enter(owner, agent, f'batch:{tick.pk}'[:64], task=task, mode='batch', now=now)
    result = {'ok': True, 'session_id': session.pk, 'done': [], 'skipped': [], 'failed': []}
    try:
        # 先撤单/改价，再处置，最后采购。
        for operation in [*actions.get('withdraws', []), *actions.get('reprices', [])]:
            key = _key(tick.pk, operation)
            try:
                trade(session, agent, key, operation, now)
                result['done'].append(operation)
            except Exception as exc:  # noqa: BLE001
                result['failed'].append({'operation': operation, 'reason': str(exc)[:300]})
        for row in actions.get('dispositions', []):
            for operation in row.get('operations', []):
                key = _key(tick.pk, operation)
                try:
                    # A forge goal can be registered after the hourly read-only precheck.
                    if row['sku'].startswith('combat.material.'):
                        live = surplus_plan(owner, agent.pk, row['sku'])
                        if not live or int(operation.get('quantity', 0)) > live['surplus']:
                            result['skipped'].append({'operation': operation, 'reason': '材料已分配给打造目标'})
                            continue
                    if row['sku'].startswith('combat.material.'):
                        trade(session, agent, key, operation, now, protect_goals=True)
                    else:
                        trade(session, agent, key, operation, now)
                    result['done'].append(operation)
                except Exception as exc:  # noqa: BLE001
                    result['failed'].append({'operation': operation, 'reason': str(exc)[:300]})
        if actions.get('equipment'):
            from .market_preparation_equipment import execute_actions
            try:
                equipment = execute_actions(owner, agent, session, plan, actions['equipment'], trade, now)
                result['done'].extend(equipment['done'])
                result['failed'].extend(equipment['failed'])
                result['skipped'].extend(equipment['skipped'])
                result['equipment_messages'] = equipment['messages']
            except Exception as exc:  # noqa: BLE001 - 保留已成交事实及尚未执行意向
                result['failed'].append({'operation': {'kind': 'preparation_equipment'}, 'reason': str(exc)[:300]})
        for operation in actions.get('goals', []):
            goal_id = operation.get('_goal', '')
            operation = {key: value for key, value in operation.items() if key != '_goal'}
            key = _key(tick.pk, operation)
            try:
                done = _purchase(session, agent, plan, key, operation, goal_id, now)
                try:
                    _record_farm_purchase(tick.owner_id, agent.pk, key, _goal_sku(goal_id), done['total'])
                except Exception:  # noqa: BLE001 - 已成交，账目补齐失败不回滚交易
                    logger.exception('种植队列采购记账失败 key=%s', key)
                result['done'].append(operation)
            except Exception as exc:  # noqa: BLE001
                result['failed'].append({'operation': operation, 'reason': str(exc)[:300]})
    finally:
        # 装备意向会逐件请求定价，成交可能晚于本轮预检时间。
        close_session(session, '按日计划批量执行完成')
    # 部分失败不影响已完成动作；全部失败才把本次预检标记为失败。
    result['ok'] = not result['failed'] or bool(result['done'])
    return result


def build_actions(owner: str, agent_id: str, plan: MarketPlan, now=None, agent=None) -> dict:
    """根据策略与目标生成可执行动作；不做模型调用。"""
    now = now or timezone.now()
    from .market_preparation_equipment import pending_actions
    actions = {'dispositions': [], 'goals': [], 'reprices': [], 'withdraws': [],
               'equipment': pending_actions(owner, agent_id)}
    from .market_plan_models import MarketDisposition
    for disposition in MarketDisposition.objects.filter(owner_id=owner, actor_id=agent_id, status='active'):
        state = surplus_plan(owner, agent_id, disposition.sku)
        if not state:
            continue
        operations = []
        if state['sell'] > 0:
            operations.extend(_sell_operation(owner, agent_id, disposition.sku, state['sell'], state['star_order']))
        if state['list'] > 0:
            operations.extend(_list_operations(owner, agent_id, disposition.sku, state['list'],
                                               state['star_order'], state['unit_price'], skip=state['sell']))
        if operations:
            actions['dispositions'].append({'sku': disposition.sku, 'operations': operations,
                                             'sell': state['sell'], 'list': state['list']})
    # 仅在本轮只读预检中复用；下一轮重新读取库存和计划预留。
    crafting_facts = {}
    for goal in plan.goals.filter(status='open'):
        operation = _goal_buy(owner, agent_id, plan, goal, now, agent=agent, crafting_facts=crafting_facts)
        if operation:
            actions['goals'].append(operation)
    # 挂牌超过两天每天最多小幅降价一次，且不低于回收价；装备挂牌同样适用。
    from django.db.models import Q
    stale = storage_time(now - timedelta(days=2))
    last_drop = storage_time(now - timedelta(days=1))
    rows = MarketListing.objects.filter(owner_id=owner, seller_id=agent_id, status='active').filter(
        Q(created_at__lt=stale, repriced_at__isnull=True) | Q(repriced_at__lt=last_drop))
    for listing in rows.order_by('created_at')[:10]:
        floor = Decimal(str((listing.item or {}).get('value') or 0))
        new_price = max(floor, (listing.unit_price * Decimal('0.9')).quantize(Decimal('0.01')))
        if new_price < Decimal('0.01') or new_price >= listing.unit_price:
            continue
        actions['reprices'].append({'kind': 'reprice', 'listing_id': listing.pk,
                                    'version': listing.version, 'unit_price': str(new_price)})
    return actions
