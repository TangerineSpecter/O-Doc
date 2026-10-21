"""每小时预检与按需进场：先只读判断，命中才进入市场会话。"""
import hashlib
import logging
import time
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from system_settings.decision.routing import choose_scene
from system_settings.models import Agent, WorldActionRuntime

from .life_config import effective_settings, market_automation_enabled
from .life_models import LifeConfig
from .life_time import local_time, storage_time
from .market_batch import build_actions, execute
from .market_models import MarketListing
from .market_no_buy import filter_candidates, record as record_no_buy
from .market_plan_models import MarketPlan, MarketTick, tick_id

logger = logging.getLogger(__name__)

MAX_MINUTE = 54  # 避开每小时最后五分钟，防止会话跨批次刷新
EQUIPMENT_TRIES = 2


def stable_minute(owner: str, actor_id: str, hour) -> int:
    """稳定随机分钟：避开整点与每小时最后五分钟。"""
    digest = hashlib.sha256(f'market-tick:{owner}:{actor_id}:{hour.isoformat()}'.encode()).hexdigest()
    return 1 + int(digest[:8], 16) % MAX_MINUTE


def ensure_ticks(now=None) -> int:
    """为活跃居民生成当小时唯一预检；重复调用不会重复触发。"""
    now = now or timezone.now()
    local = local_time(now)
    hour = local.replace(minute=0, second=0, microsecond=0)
    count = 0
    for config in LifeConfig.objects.filter(migrated=True):
        if not market_automation_enabled(config, now):
            continue
        paused = set(config.paused_agents or [])
        for actor_id in effective_settings(config, now).get('agent_ids', []):
            if actor_id in paused:
                continue
            identity = tick_id(config.pk, actor_id, hour)
            scheduled = storage_time(hour + timedelta(minutes=stable_minute(config.pk, actor_id, hour)))
            _, created = MarketTick.objects.get_or_create(pk=identity, defaults={
                'owner_id': config.pk, 'actor_id': actor_id,
                'hour': storage_time(hour), 'scheduled_at': scheduled,
            })
            count += int(created)
    return count


def _current_slot(owner: str, actor_id: str, slot: str) -> dict:
    from .combat.models import CombatProfile, EquipmentInstance
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    equipment_id = (profile.loadout or {}).get(slot) if profile else None
    gear = EquipmentInstance.objects.filter(pk=equipment_id, owner_id=owner).first() if equipment_id else None
    if not gear:
        return {}
    snapshot = gear.snapshot or {}
    return {'name': snapshot.get('name', '装备'), 'level': snapshot.get('level'),
            'rarity': snapshot.get('rarity', ''), 'value': str(gear.value)}


def _equipment_actions(owner: str, agent, plan: MarketPlan, now) -> list[dict]:
    from .combat.models import CombatProfile, EquipmentInstance
    profile = CombatProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    job = (profile.progression or {}).get('job', '') if profile else ''
    level = int((profile.progression or {}).get('level', 1)) if profile else 1
    actions = []
    remaining = max(Decimal(0), plan.budget - plan.spent)
    for goal in plan.goals.filter(kind='equipment', status='open'):
        if remaining <= 0:
            break
        # 戒指部位在快照里统一记为 accessory，靠穿戴规则区分 ring_1 / ring_2。
        snapshot_slot = 'accessory' if goal.slot in ('accessory', 'ring_1', 'ring_2') else goal.slot
        rows = list(MarketListing.objects.filter(
            owner_id=owner, status='active', item__source__kind='combat_equipment',
            item__equipment_snapshot__slot=snapshot_slot).exclude(seller_id=agent.pk)
            .order_by('unit_price', 'created_at')[:10])
        gear_ids = [str((row.item or {}).get('source', {}).get('equipment_id') or '') for row in rows]
        gears = {gear.pk: gear for gear in EquipmentInstance.objects.filter(pk__in=[key for key in gear_ids if key])}
        current_id = (profile.loadout or {}).get(goal.slot) if profile else None
        current = EquipmentInstance.objects.filter(pk=current_id, owner_id=owner).first() if current_id else None
        candidates = []
        for row in rows:
            item = row.item or {}
            equipment_id = str((item.get('source') or {}).get('equipment_id') or '')
            gear = gears.get(equipment_id)
            snapshot = (gear.snapshot if gear else item.get('equipment_snapshot')) or {}
            candidates.append({'listing_id': row.pk, 'version': row.version,
                               'equipment_id': equipment_id,
                               'snapshot': snapshot, 'rules': gear.rules if gear else {},
                               'name': item.get('name', '装备'),
                               'price': str(row.unit_price), 'quantity': 1})
        filtered = filter_candidates(owner, agent.pk, candidates, job, level,
                                     slot=goal.slot, current=current.snapshot if current else None)
        for candidate in filtered[:EQUIPMENT_TRIES]:
            if not candidate['equipment_id']:
                continue
            unit_price = Decimal(candidate['price'])
            if goal.max_unit_price and unit_price > goal.max_unit_price:
                continue
            if unit_price > remaining:
                continue
            state = {
                'job': job, 'level': level, 'slot': goal.slot,
                'current': _current_slot(owner, agent.pk, goal.slot),
                'candidate': {'name': candidate['name'], 'price': candidate['price'],
                              'snapshot': candidate['snapshot']},
                'goal_max_price': str(goal.max_unit_price), 'market_budget_left': str(remaining),
            }
            choice = choose_scene(
                owner, agent, 'market_equipment', state,
                {'buy': '买下这件装备', 'no': '不买这件'}, deadline=time.monotonic() + 20,
                question_id=f'market-equipment:{goal.pk}:{candidate["equipment_id"]}',
                instructions=('根据职业、等级、当前部位装备和候选装备属性，判断是否值得买入。'
                              '不买表示这件具体装备以后都不再考虑；买下后仍需在探索准备中换装。'
                              '只能选一个选项。'),
                include_role=False, max_probability=True)
            if choice == 'buy':
                actions.append({'kind': 'buy_listing', 'listing_id': candidate['listing_id'],
                                'version': candidate['version'], 'quantity': 1,
                                'unit_price': candidate['price'], '_goal': goal.pk})
                break
            if choice == 'no':
                record_no_buy(owner, agent.pk, candidate['equipment_id'],
                              snapshot=candidate['snapshot'], price=unit_price,
                              reason=f'{goal.slot} 部位比较后判定不买')
    return actions


def _summary(actions: dict) -> dict:
    return {'dispositions': len(actions.get('dispositions', [])),
            'goals': len(actions.get('goals', [])),
            'reprices': len(actions.get('reprices', [])),
            'withdraws': len(actions.get('withdraws', []))}


def run(now=None, limit: int = 3) -> dict:
    """处理到点的预检；没有动作不扣体力、不占世界执行位。"""
    now = now or timezone.now()
    ensure_ticks(now)
    current_hour = storage_time(local_time(now).replace(minute=0, second=0, microsecond=0))
    ticks = list(MarketTick.objects.filter(status='pending', scheduled_at__lte=now)
                 .order_by('scheduled_at', 'id')[:limit])
    result = {'checked': 0, 'entered': 0, 'skipped': 0, 'failed': 0}
    for tick in ticks:
        result['checked'] += 1
        if tick.hour < current_hour:
            tick.status = 'skipped'
            tick.reason = '错过执行时段，不补跑'
            tick.save(update_fields=['status', 'reason', 'updated_at'])
            result['skipped'] += 1
            continue
        if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
            tick.status = 'skipped'
            tick.reason = '本机自动执行已关闭'
            tick.save(update_fields=['status', 'reason', 'updated_at'])
            result['skipped'] += 1
            continue
        agent = Agent.objects.filter(pk=tick.actor_id, archived_at__isnull=True).first()
        if not agent:
            tick.delete()
            continue
        config = LifeConfig.objects.filter(pk=tick.owner_id).first()
        if not config or not market_automation_enabled(config, now):
            tick.status = 'skipped'
            tick.reason = '市场自动化已关闭或生活配置不存在'
            tick.save(update_fields=['status', 'reason', 'updated_at'])
            result['skipped'] += 1
            continue
        if tick.actor_id in (config.paused_agents or []):
            tick.status = 'skipped'
            tick.reason = '居民已暂停自动执行'
            tick.save(update_fields=['status', 'reason', 'updated_at'])
            result['skipped'] += 1
            continue
        plan = MarketPlan.objects.filter(owner_id=tick.owner_id, actor_id=tick.actor_id,
                                         plan_date=local_time(now).date()).first()
        if not plan or plan.status != 'active':
            tick.status = 'skipped'
            tick.reason = '当日市场计划未生成或已失败'
            tick.save(update_fields=['status', 'reason', 'updated_at'])
            result['skipped'] += 1
            continue
        try:
            # 当天种植队列出现新缺口时先补采购目标；缺口变了才写入，不重复建目标。
            from .market_planning import refresh_queue_needs
            try:
                refresh_queue_needs(tick.owner_id, tick.actor_id, now)
            except Exception:  # noqa: BLE001 - 补目标失败不应跳过本小时其他动作
                logger.exception('农场队列缺口刷新失败 actor=%s', tick.actor_id)
            plan.refresh_from_db()
            actions = build_actions(tick.owner_id, tick.actor_id, plan, now, agent=agent)
            actions['goals'].extend(_equipment_actions(tick.owner_id, agent, plan, now))
            if not any(actions.get(key) for key in ('dispositions', 'goals', 'reprices', 'withdraws')):
                tick.status = 'skipped'
                tick.reason = '本轮没有可执行的买卖'
                tick.hits = _summary(actions)
                tick.save(update_fields=['status', 'reason', 'hits', 'updated_at'])
                result['skipped'] += 1
                continue
            tick.hits = {**_summary(actions), 'stamina_cost': 5}
            outcome = execute(tick.owner_id, agent, plan, tick, actions, now)
            tick.session_id = outcome.get('session_id', '')
            tick.status = 'done' if outcome.get('ok') else 'failed'
            tick.reason = (f"完成 {len(outcome.get('done', []))} 笔，"
                           f"跳过 {len(outcome.get('skipped', []))} 笔，"
                           f"失败 {len(outcome.get('failed', []))} 笔")
            tick.hits = {**tick.hits, 'outcome': outcome}
            tick.save(update_fields=['status', 'reason', 'hits', 'session_id', 'updated_at'])
            result['entered'] += 1
        except Exception as exc:  # noqa: BLE001 - 单个居民失败不能拖垮其他预检
            logger.exception('市场预检执行失败 tick=%s', tick.pk)
            tick.status = 'failed'
            tick.reason = str(exc)[:500]
            tick.save(update_fields=['status', 'reason', 'updated_at'])
            result['failed'] += 1
    return result
