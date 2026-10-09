"""每日独立市场机会：时间持久化，到点才决策，不占普通生活次数。"""
import logging
import random
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from system_settings.models import Agent, AgentExecutionLease, WorldAction, WorldActionRuntime
from .execution import WorldLeaseBusy, defer_when_world_busy, stamina
from .farm_gate import guarded
from .life_config import DEFAULTS, effective_settings, ensure_profiles, tasks_for
from .life_models import LifeConfig, LifeItem
from .life_schedule import execution_key, revise, stable_id, window
from .life_time import local_time

logger = logging.getLogger(__name__)


@guarded
@transaction.atomic
def ensure_daily_market(config: LifeConfig, now: datetime) -> None:
    settings = {**DEFAULTS, **effective_settings(config, now)}
    task = next((t for t in tasks_for(config.pk) if t.enabled and t.task_kind == 'market'), None)
    if not task:
        return
    now = local_time(now)
    left, right = window(settings, now.date())
    # 开机较晚时只使用当天剩余时间，不立即补跑原本已经错过的小时。
    left = max(left, now + timedelta(minutes=5))
    if left >= right:
        return
    actors = sorted(Agent.objects.filter(pk__in=settings['agent_ids'], model__isnull=False)
                    .values_list('pk', flat=True))
    if not actors:
        return
    day = now.date().isoformat()
    identities = {actor: stable_id(config.pk, actor, day, 'market-prepare') for actor in actors}
    existing = set(LifeItem.objects.filter(pk__in=identities.values()).values_list('pk', flat=True))
    eligible = [actor for actor in actors if actor not in config.paused_agents and identities[actor] not in existing]
    if not eligible:
        return
    ensure_profiles(config.pk, eligible)
    rng = random.Random(stable_id(config.pk, day, 'market-times'))
    rng.shuffle(actors)
    span = (right - left).total_seconds() / len(actors)
    for index, actor in enumerate(actors):
        point = left + timedelta(seconds=(index + rng.random()) * span)
        # 沿用历史每日身份；已经决定不去或执行失败也不能生成第二次机会。
        if actor not in eligible:
            continue
        LifeItem.objects.create(
            pk=identities[actor], owner_id=config.pk, actor_id=actor, original_at=point, scheduled_at=point,
            activity='market_prepare', task_id=task.pk, intent='每日一次逛市场机会，到点按实际需求决定是否进入',
        )


def recover_daily_market(item: LifeItem, config: LifeConfig, now: datetime) -> None:
    """当天机会可继续等待；过去日期的机会不累积到恢复当天。"""
    if item.status not in ('pending', 'deferred', 'paused'):
        return
    settings = {**DEFAULTS, **effective_settings(config, now)}
    _, right = window(settings, local_time(item.original_at).date())
    if now >= right:
        revise(item, '当天市场机会已过期，不跨天补跑', status='rest', result={'reason': '当天市场机会已过期'})
    elif item.actor_id in config.paused_agents:
        if item.status != 'paused':
            revise(item, '居民暂停，保留当天市场机会', status='paused')
    elif item.status == 'paused':
        revise(item, '居民恢复，继续等待当天市场机会', status='pending')


def execute_daily_market(config: LifeConfig, agent: Agent, item: LifeItem, scheduler) -> None:
    from .life_context import build_context
    from .life_planner import check_goals
    from .life_scope import life_scope
    from .market_runner import run_market_opportunity
    from .travel_candidates import travelling_ids

    now = local_time()
    recover_daily_market(item, config, now)
    if item.status not in ('pending', 'deferred') or local_time(item.scheduled_at) > now:
        return
    task = next((t for t in tasks_for(config.pk) if t.pk == item.task_id and t.enabled), None)
    if not task or task.task_kind != 'market':
        revise(item, '市场能力已停用或删除', status='cancelled')
        return
    runtime = WorldActionRuntime.objects.filter(pk='world').first()
    if not runtime or not runtime.enabled or (runtime.token and runtime.until and runtime.until > timezone.now()):
        return
    busy = agent.pk in travelling_ids() or AgentExecutionLease.objects.filter(agent_id=agent.pk, until__gt=timezone.now()).exists()
    if busy or stamina(agent) < 5:
        settings = {**DEFAULTS, **effective_settings(config, now)}
        point = now + timedelta(minutes=settings['min_gap_minutes'])
        _, right = window(settings, local_time(item.original_at).date())
        if item.attempts >= 3 or point >= right:
            revise(item, '当天无法逛市场，本次机会结束', status='rest', result={'reason': '居民忙碌或体力不足'})
        else:
            revise(item, '居民忙碌或体力不足，当天顺延市场机会', status='deferred',
                   scheduled_at=point, attempts=item.attempts + 1)
        return
    prior_status = item.status
    with transaction.atomic():
        locked = LifeItem.objects.select_for_update().get(pk=item.pk)
        if locked.status not in ('pending', 'deferred'):
            return
        revise(locked, '每日市场机会到点', status='running',
               context={**locked.context, 'execution_started': timezone.now().isoformat()})
    marker = defer_when_world_busy.set(True)
    try:
        # 市场执行器本身会决定去不去，并可用预算工具申请实际采购额度。
        with life_scope(item, build_context(config.pk, agent, item)):
            record = run_market_opportunity(task, scheduler, key=execution_key(item))
        item.refresh_from_db()
        action = WorldAction.objects.filter(pk=execution_key(item)).first()
        status = ('failed' if record and record.status == 'failed' else
                  'rest' if not record or (action and action.status == 'skipped') else 'completed')
        revise(item, '每日市场机会结束', status=status, record_id=record.pk if record else '',
               result={'reason': record.summary if record else '居民未能进入市场'})
        check_goals(config.pk, agent)
    except WorldLeaseBusy:
        item.refresh_from_db()
        revise(item, '世界执行位忙碌，保留当天市场机会', status=prior_status,
               context={key: value for key, value in item.context.items() if key != 'execution_started'})
    except Exception as exc:
        logger.exception('每日市场机会失败 item=%s', item.pk)
        item.refresh_from_db()
        revise(item, '每日市场机会执行失败', status='failed', result={'reason': str(exc)[:500]})
    finally:
        defer_when_world_busy.reset(marker)
