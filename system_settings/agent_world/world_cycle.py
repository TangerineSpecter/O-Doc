"""Coordinate world maintenance, recovery and execution without owning domain workflows."""
import logging
from datetime import timedelta

from django.utils import timezone

from system_settings.models import AgentActivity, AgentRunRecord, WorldAction, WorldActionRuntime
from .action_runner import repair_effects
from .execution import execution_lease

logger = logging.getLogger(__name__)


def _advance_independent_domains(scheduler):
    from .tournament_runner import tick as tick_tournaments
    tick_tournaments()
    from .market_sessions import cleanup
    cleanup(restart=True)
    # 入库处置标记独立于市场会话；任务至少静置一分钟再跑，避免每次 tick 都调模型。
    from .life_config import market_automation_enabled
    from .life_models import LifeConfig
    from .market_plan_models import MarketDispositionTask
    from .market_disposition_worker import recover_stale_tasks, run as run_dispositions
    automation = any(market_automation_enabled(config) for config in LifeConfig.objects.filter(migrated=True))
    if automation:
        recover_stale_tasks()
    oldest = (MarketDispositionTask.objects
              .filter(status__in=('pending', 'failed'), attempts__lt=3)
              .order_by('created_at').first())
    if automation and oldest and (timezone.now() - oldest.created_at).total_seconds() >= 60:
        try:
            run_dispositions(limit=5, seconds=20)
        except Exception:
            logger.exception('市场处置标记失败')
    # 小时预检：只读判断，命中才进场；每次 tick 最多处理少量居民，避免占满执行位。
    from .market_tick import run as run_market_ticks
    try:
        run_market_ticks(limit=3)
    except Exception:
        logger.exception('市场小时预检失败')
    from .bounty_runner import tick as tick_bounties
    try:
        tick_bounties(scheduler)
    except Exception:
        logger.exception('悬赏轮询失败')


def _recover_committed_work(scheduler):
    for action in WorldAction.objects.filter(status__in=['success', 'skipped', 'failed'], effects_done=False).select_related('agent', 'record')[:20]:
        try:
            repair_effects(action)
        except Exception:
            logger.exception('Failed to recover action effects: action=%s', action.pk)
    from .publish_media import recover_photos
    recover_photos()
    from .publish_runner import deliver_notification
    for publication in WorldAction.objects.filter(status='success', snapshot__notification_pending=True, task__isnull=False).select_related('task', 'record')[:20]:
        if publication.task_id:
            try:
                deliver_notification(publication, scheduler)
            except Exception:
                logger.exception('发帖通知恢复失败 action=%s', publication.pk)
    # 手动投资同样需要恢复终态，不能依赖世界自动运行开关。
    from .investment_lifecycle import recover as recover_investments
    recover_investments()


def _close_interrupted_actions(stale):
    interrupted = WorldAction.objects.filter(status='claimed', updated_at__lt=stale).exclude(task__task_kind__in=['post_publish', 'travel', 'farm', 'investment', 'cooking', 'alchemy', 'blacksmith'])
    record_ids = list(interrupted.values_list('record_id', flat=True))
    interrupted.update(status='failed', result={'reason': '执行中断，本机会结束；已提交操作保留。未捕获底层异常，无法确定中断原因。'})
    AgentRunRecord.objects.filter(pk__in=record_ids, status='running').update(status='failed', summary='执行中断，本机会结束', updated_at=timezone.now())
    AgentActivity.objects.filter(run_record_id__in=record_ids, activity_type='work', status='running').update(
        status='failed', summary='执行中断，本机会结束', current_action='执行已中断', updated_at=timezone.now(),
    )
    for action in WorldAction.objects.filter(record_id__in=record_ids, status='failed').select_related('record', 'agent'):
        repair_effects(action)


def _advance_preparation_and_life(scheduler):
    # 到期生活安排先于发帖恢复。世界执行锁被占用时也不跳过生活循环，否则到点日程会一直停在待执行。
    from .life_runner import tick_life
    from .cooking_runner import tick_cooking
    tick_cooking(scheduler)
    from .alchemy_runner import tick_alchemy
    tick_alchemy(scheduler)
    from .blacksmith_runner import tick_blacksmith
    tick_blacksmith(scheduler)
    tick_life(scheduler)


def tick(scheduler):
    _advance_independent_domains(scheduler)
    _recover_committed_work(scheduler)
    # 只收束无法继续的旧机会；已确认事实不重新执行模型或结算。
    stale = timezone.now() - timedelta(minutes=15)
    _close_interrupted_actions(stale)
    runtime, _ = WorldActionRuntime.objects.get_or_create(pk='world')
    _advance_preparation_and_life(scheduler)
    with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
        if not token:
            return
        from .travel_runner import tick_travel
        tick_travel(scheduler, token, manual_only=not runtime.enabled)
        from .farm_runner import tick_farms
        tick_farms(scheduler, token, runtime.enabled)
        if not runtime.enabled:
            return
        # 恢复可能继续检索、写作和发布，同样受本机开关与世界执行锁约束。
        publications = WorldAction.objects.filter(status='claimed', updated_at__lt=stale, task__task_kind='post_publish').select_related('task')
        for pending in publications[:20]:
            from .publish_runner import run_publish_opportunity
            run_publish_opportunity(pending.task, scheduler, key=pending.pk, manual=False, locked=token)
    if runtime.enabled:
        from .social_runner import tick_social
        tick_social(scheduler)
