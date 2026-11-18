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

from .market_disposition import rows_for, select_rows, surplus_plan
from . import market_material_disposition as materials
from .market_models import MarketListing, MarketTransaction
from .market_plan_models import MarketGoal, MarketPlan
from .market_plan_candidates import craftable_after_purchase, crafting_input_domain
from .market_service import trade
from .inventory_policy import RetentionChanged
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


def _sell_operation(owner: str, actor_id: str, sku: str, quantity: int, star_order: str, *, context=None) -> list[dict]:
    return [{'kind': 'sell', 'item_id': row.pk, 'quantity': take}
            for row, take in select_rows(owner, actor_id, sku, quantity, star_order, context=context)]


def _list_operations(owner: str, actor_id: str, sku: str, quantity: int, star_order: str,
                     unit_price: Decimal, *, skip: int = 0, context=None) -> list[dict]:
    operations = []
    for row, take in select_rows(owner, actor_id, sku, quantity, star_order, skip=skip,
                                 prevent_expired_relisting=True, context=context):
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
    candidates = rows.order_by('unit_price', 'created_at')
    cache = crafting_facts if crafting_facts is not None else {}
    buyer = agent
    if goal.kind == 'listing' and crafting_input_domain(goal.sku) and buyer is None:
        from .life_config import owns_actor
        buyer = (Agent.objects.filter(pk=actor_id, archived_at__isnull=True).first()
                 if owns_actor(owner, actor_id) else None)
    for listing in candidates:
        from .market_listing_expiry import is_expired
        if is_expired(listing, now):
            continue
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
              goal_id: str, now, *, equipment=False) -> dict:
    """交易、实时资金预留检查及计划记账一起提交；重放不重复记账。"""
    agent = Agent.objects.select_for_update().get(pk=agent.pk)
    plan = MarketPlan.objects.select_for_update().get(
        pk=plan.pk, owner_id=session.owner_id, actor_id=agent.pk)
    if MarketTransaction.objects.filter(pk=key).exists():
        return trade(session, agent, key, operation, now)
    reservations = LifeItem.objects.select_for_update().filter(
        owner_id=plan.owner_id, actor_id=agent.pk, status__in=OPEN)
    reserved = sum((remaining_reservation(row) for row in reservations), Decimal(0))
    available = (max(Decimal(0), agent.money - reserved - max(Decimal(0), plan.budget - plan.spent))
                 if equipment else max(Decimal(0), min(plan.budget - plan.spent, agent.money - reserved)))
    if equipment:
        from .market_equipment_candidates import equipment_candidates
        if not equipment_candidates(session.owner_id, agent.pk, listing_ids=[operation['listing_id']]):
            raise ValueError('装备已不可购买或不再符合穿戴条件')
    if _unit_price(operation) * int(operation.get('quantity', 1)) > available:
        raise ValueError('超出当日市场预算或资金已预留给其他生活安排')
    result = trade(session, agent, key, operation, now)
    # 以成交金额而非预检报价记账；价格变化不能突破事务内检查的上限。
    amount = Decimal(result['total'])
    if amount > available:
        raise ValueError('实际成交金额超出当日市场预算或生活可用资金')
    if goal_id:
        _record_goal(goal_id, int(result['quantity']))
    if equipment:
        # Opportunistic equipment shopping adds only committed spend; leave daily goal funds intact.
        plan.budget += amount
    plan.spent += amount
    plan.save(update_fields=['budget', 'spent', 'updated_at'])
    return result


def equipment_funds(owner: str, actor_id: str, plan: MarketPlan) -> Decimal:
    """Protect both life reservations and the daily plan's still-unspent allocation."""
    plan.refresh_from_db()
    balance = Agent.objects.get(pk=actor_id).money
    reserved = sum((remaining_reservation(row) for row in LifeItem.objects.filter(
        owner_id=owner, actor_id=actor_id, status__in=OPEN)), Decimal(0))
    return max(Decimal(0), balance - reserved - max(Decimal(0), plan.budget - plan.spent))


def execute(owner: str, agent, plan: MarketPlan | None, tick, actions: dict, now=None) -> dict:
    """actions: {'dispositions':[...], 'goals':[...], 'reprices':[...], 'equipment':[...]}"""
    from .life_config import task_for
    task = task_for(owner, agent, 'market')
    if not task:
        return {'ok': False, 'reason': '没有可用的市场任务'}
    now = now or timezone.now()
    session = enter(owner, agent, f'batch:{tick.pk}'[:64], task=task, mode='batch', now=now,
                    clear_fish=True)
    result = {'ok': True, 'session_id': session.pk, 'done': [], 'skipped': [], 'failed': [],
              'stock_settled': []}
    fish_sale = getattr(session, 'fish_sale', None)
    if fish_sale and fish_sale['sold']:
        result['fish_sale'] = fish_sale
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
            settled = {'sku': row['sku'], 'sold': 0, 'listed': 0}
            result['stock_settled'].append(settled)
            for operation in row.get('operations', []):
                key = _key(tick.pk, operation)
                try:
                    material_options = ({'material_recovery_only': plan is None}
                                        if operation['kind'] == 'sell_combat_material' else {})
                    receipt = trade(session, agent, key, operation, now, protect_goals=True,
                                    retention_sku=row['sku'], retention_revision=row['revision'], **material_options)
                    field = 'listed' if operation['kind'] == 'list' else 'sold'
                    settled[field] += receipt['quantity']
                    result['done'].append(operation)
                except RetentionChanged as exc:
                    result['skipped'].append({'operation': operation, 'reason': str(exc)[:300]})
                except Exception as exc:  # noqa: BLE001
                    result['failed'].append({'operation': operation, 'reason': str(exc)[:300]})
        if actions.get('equipment'):
            from .market_preparation_equipment import execute_actions
            try:
                equipment = execute_actions(owner, agent, session, plan, actions['equipment'], trade)
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
        if actions.get('equipment_listings'):
            from .market_equipment_shopping import shop_equipment
            shopping = shop_equipment(owner, agent, session, plan, tick,
                actions['equipment_listings'], _purchase, _key, equipment_funds)
            for key in ('done', 'failed', 'skipped'):
                result[key].extend(shopping[key])
            result['equipment_decisions'] = shopping['decisions']
    finally:
        close_session(session, '按日计划与逐件装备判断执行完成')
    # 部分失败不影响已完成动作；全部失败才把本次预检标记为失败。
    result['ok'] = not result['failed'] or bool(result['done'])
    return result


def _stock_actions(owner: str, actor_id: str, sku: str, state: dict, context: dict,
                   room: int | None, allow_listing: bool) -> tuple[list[dict], dict]:
    if sku.startswith(materials.MATERIAL_PREFIX):
        sale, listing, expired = materials.plan(owner, actor_id, rows_for(owner, actor_id, sku), state, room)
        sold = sum(sale.values())
        operations = ([{'kind': 'sell_combat_material', 'material_id': sku.removeprefix('combat.'),
                        'quantity': sold}] if sold else [])
        operations.extend({'kind': 'list', 'item_id': identity, 'quantity': count,
                           'unit_price': str(state['unit_price'])} for identity, count in listing.items())
        listed, blocked = sum(listing.values()), 0
    else:
        sold = state['sell'] if allow_listing or state['sell_ratio'] == 100 else 0
        expired = 0
        operations = (_sell_operation(owner, actor_id, sku, sold, state['star_order'], context=context)
                      if sold else [])
        listings = (_list_operations(owner, actor_id, sku, state['list'], state['star_order'],
                                     state['unit_price'], skip=sold, context=context)
                    if allow_listing and state['list'] else [])
        operations.extend(listings)
        listed = sum(row['quantity'] for row in listings)
        blocked = state['list'] - listed if allow_listing else 0
    return operations, {'sku': sku, 'sell': sold, 'list': listed,
                        'expired_return': expired, 'blocked_listing': blocked}


def build_actions(owner: str, agent_id: str, plan: MarketPlan | None, now=None, agent=None) -> dict:
    """根据策略与目标生成可执行动作；不做模型调用。"""
    now = now or timezone.now()
    from .market_preparation_equipment import pending_actions
    actions = {'dispositions': [], 'goals': [], 'reprices': [], 'withdraws': [], 'stock_disposition': [],
               'equipment': pending_actions(owner, agent_id) if plan is not None else []}
    from .market_plan_models import MarketDisposition
    from .inventory_protection import read_context
    protection_context = read_context(owner, agent_id)
    policies = list(MarketDisposition.objects.filter(owner_id=owner, actor_id=agent_id, status='active'))
    listing_rooms = (materials.listing_room(owner, agent_id, now) if plan is not None and
                     any(policy.sku.startswith(materials.MATERIAL_PREFIX) for policy in policies) else {})
    for disposition in policies:
        # 鱼在进场时统一回收，不再按处置策略生成出售或上架动作。
        if disposition.sku.startswith('fish.'):
            continue
        state = surplus_plan(owner, agent_id, disposition.sku, context=protection_context)
        if not state or not state['surplus']:
            continue
        room = listing_rooms.get(disposition.sku, materials.LISTING_LIMIT) if plan is not None else None
        operations, counts = _stock_actions(owner, agent_id, disposition.sku, state, protection_context,
                                            room, plan is not None)
        if operations or counts['blocked_listing']:
            actions['stock_disposition'].append(counts)
        if operations:
            actions['dispositions'].append({**counts, 'operations': operations, 'revision': state['revision']})
    if plan is None:
        return actions
    # 仅在本轮只读预检中复用；下一轮重新读取库存和计划预留。
    crafting_facts = {}
    for goal in plan.goals.filter(status='open'):
        operation = _goal_buy(owner, agent_id, plan, goal, now, agent=agent, crafting_facts=crafting_facts)
        if operation:
            actions['goals'].append(operation)
    # 首次挂牌或上次改价满一天后可降价，避免首次自动改价落在到期之后。
    from django.db.models import Q
    last_drop = storage_time(now - timedelta(days=1))
    rows = MarketListing.objects.filter(owner_id=owner, seller_id=agent_id, status='active').filter(
        Q(created_at__lt=last_drop, repriced_at__isnull=True) | Q(repriced_at__lt=last_drop))
    from .market_listing_expiry import is_expired
    for listing in rows.order_by('created_at'):
        if is_expired(listing, now):
            continue
        floor = Decimal(str((listing.item or {}).get('value') or 0))
        sku = ((listing.item or {}).get('source') or {}).get('sku', '')
        if sku.startswith('combat.material.'):
            from .combat.material_prices import material_catalog, material_price
            floor = material_price(material_catalog(owner, agent_id), sku)
        new_price = max(floor, (listing.unit_price * Decimal('0.9')).quantize(Decimal('0.01')))
        if new_price < Decimal('0.01') or new_price >= listing.unit_price:
            continue
        actions['reprices'].append({'kind': 'reprice', 'listing_id': listing.pk,
                                    'version': listing.version, 'unit_price': str(new_price)})
        if len(actions['reprices']) >= 10:
            break
    return actions
