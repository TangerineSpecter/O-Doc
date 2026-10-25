"""每小时预检与按需进场：先检查需求与报价，命中才进入市场会话。"""
import hashlib
import logging
from datetime import timedelta

from django.utils import timezone

from system_settings.models import Agent, WorldActionRuntime

from .life_config import effective_settings, market_automation_enabled
from .life_models import LifeConfig
from .life_time import local_time, storage_time
from .market_batch import build_actions, execute
from .market_plan_models import MarketPlan, MarketTick, tick_id

logger = logging.getLogger(__name__)

MAX_MINUTE = 54  # 避开每小时最后五分钟，防止会话跨批次刷新


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


def _summary(actions: dict) -> dict:
    return {'dispositions': len(actions.get('dispositions', [])),
            'goals': len(actions.get('goals', [])),
            'reprices': len(actions.get('reprices', [])),
            'withdraws': len(actions.get('withdraws', [])),
            'equipment': len(actions.get('equipment', []))}


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
        # Claim before any decision call so concurrent scheduler polls cannot ask twice.
        if not MarketTick.objects.filter(pk=tick.pk, status='pending').update(status='entered'):
            continue
        try:
            # 当天种植队列出现新缺口时先补采购目标；缺口变了才写入，不重复建目标。
            from .market_planning import refresh_queue_needs, retire_equipment_goals
            retire_equipment_goals(plan)
            try:
                refresh_queue_needs(tick.owner_id, tick.actor_id, now)
            except Exception:  # noqa: BLE001 - 补目标失败不应跳过本小时其他动作
                logger.exception('农场队列缺口刷新失败 actor=%s', tick.actor_id)
            plan.refresh_from_db()
            from .market_bait_refresh import refresh_bait_needs
            try:
                refresh_bait_needs(tick.owner_id, agent, plan, now)
            except Exception:  # noqa: BLE001 - 鱼饵决策故障不能阻断其他买卖
                logger.exception('小时鱼饵补购失败 actor=%s', tick.actor_id)
            plan.refresh_from_db()
            actions = build_actions(tick.owner_id, tick.actor_id, plan, now, agent=agent)
            from .market_equipment_candidates import equipment_candidates, equipment_summary
            from .market_equipment_shopping import decide_entry
            from .market_batch import equipment_funds
            candidates = equipment_candidates(tick.owner_id, agent.pk)
            actions['equipment_listings'] = [row['listing_id'] for row in candidates]
            if not candidates and not any(actions.get(key) for key in ('dispositions', 'goals', 'reprices', 'withdraws', 'equipment')):
                tick.status = 'skipped'
                tick.reason = '本轮没有可执行的买卖'
                tick.hits = {**(tick.hits or {}), **_summary(actions)}
                tick.save(update_fields=['status', 'reason', 'hits', 'updated_at'])
                result['skipped'] += 1
                continue
            entry = decide_entry(tick.owner_id, agent, tick, actions, candidates,
                                 equipment_funds(tick.owner_id, agent.pk, plan))
            tick.hits = {**(tick.hits or {}), **_summary(actions),
                         'equipment_candidates': equipment_summary(candidates), 'entry_choice': entry}
            if entry != 'enter':
                tick.status = 'skipped'
                tick.reason = '居民决定本小时不去市场' if entry == 'wait' else '市场进场决策不可用，留待下小时'
                tick.save(update_fields=['status', 'reason', 'hits', 'updated_at'])
                result['skipped'] += 1
                continue
            tick.hits['stamina_cost'] = 5
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
