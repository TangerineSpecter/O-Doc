"""Reconcile quota-blocked schedules without replaying completed publication facts."""
from django.db import transaction
from django.db.models import CharField, Exists, F, OuterRef, Q, Value
from django.db.models.fields.json import KT
from django.db.models.functions import Coalesce, NullIf

from system_settings.models import Agent, AgentTask, WorldAction, WorldActionRuntime
from .farm_gate import guarded
from .life_models import LifeConfig, LifeItem
from .life_time import local_time

QUOTA_REASONS = ('本期发帖总量已达到上限', '该 Agent 本期发帖量已达到上限')
QUOTA_SKIP_REASONS = (*QUOTA_REASONS, *(reason + '，请重新规划日程' for reason in QUOTA_REASONS))

INTENTION_BATCH_SIZE = 50
# A restart only restarts the scan. Execution always checks the due item directly.
_scan_after: dict[str, str] = {}


def _publish_task(owner: str) -> AgentTask | None:
    return AgentTask.objects.filter(
        task_kind='post_publish', enabled=True, publish_config__owner_id=owner,
    ).only('publish_config', 'agent_ids', 'agent_id', 'task_kind').first()


def _execution_id():
    # Same fallback as life_schedule.execution_key for legacy rows with no retry key.
    return Coalesce(NullIf(KT('context__execution_key'), Value('')), F('pk'), output_field=CharField())


def quota_skip(reason: str) -> bool:
    return reason in QUOTA_SKIP_REASONS


@guarded
@transaction.atomic
def replan_if_blocked(source, *, now=None, background=False) -> bool:
    """Release only untouched automatic intentions; execution facts retain their identity."""
    from .publish_config import quota_reason
    from .life_schedule import execution_key, requeue
    item = LifeItem.objects.select_for_update().filter(pk=source.pk, owner_id=source.owner_id).first()
    if item is None or item.status not in ('pending', 'deferred') or item.context.get('manual') or item.spent or item.record_id:
        return False
    choice = item.context.get('daily_choice', {}).get('plan', {})
    if item.activity != 'post_publish' and not (item.activity == 'unplanned' and choice.get('activity') == 'post_publish'):
        return False
    if item.context.get('execution_started') or WorldAction.objects.filter(pk=execution_key(item)).exists():
        return False
    if background:
        if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
            return False
        paused = LifeConfig.objects.values_list('paused_agents', flat=True).get(pk=item.owner_id)
        if item.actor_id in paused:
            return False
    task = _publish_task(item.owner_id)
    agent = Agent.objects.only('pk').filter(pk=item.actor_id, archived_at__isnull=True).first()
    if not task or not agent:
        return False
    at = max(local_time(item.scheduled_at), local_time(now))
    reason = quota_reason(task, agent, task.publish_config, now=at)
    if not reason:
        return False
    requeue(item, '系统说明：' + reason + '，释放未执行的发帖意向，重新安排其他活动')
    if not background:
        source.refresh_from_db()
    return True


@guarded
@transaction.atomic
def repair_quota_failures(config) -> None:
    """Correct at most 200 eligible failures without replaying any action."""
    from .life_schedule import revise

    actions = WorldAction.objects.filter(pk=OuterRef('execution_id'))
    quota_skips = actions.filter(status='skipped', energy_cost=0, result__reason__in=QUOTA_SKIP_REASONS)
    rows = (
        LifeItem.objects.select_for_update().alias(execution_id=_execution_id())
        .filter(owner_id=config.pk, status='failed', spent=0, result__reason__in=QUOTA_SKIP_REASONS)
        .filter(Q(activity='post_publish') | Q(context__daily_choice__plan__activity='post_publish'))
        .filter(~Exists(actions) | Exists(quota_skips))
        .order_by('scheduled_at', 'pk')[:200]
    )
    for item in rows:
        revise(item, '系统说明：周期发帖上限导致未执行，修正为休息，保留原执行记录', status='rest')


def replan_quota_intentions(config, now=None) -> None:
    """Scan one stable page without a write lock; recheck each actual change under the gate."""
    from .publish_config import quota_bounds, quota_reason, quota_usage

    task = _publish_task(config.pk)
    if not task or not task.publish_config.get('quota_enabled'):
        _scan_after.pop(config.pk, None)
        return
    now = local_time(now)
    pending = (
        LifeItem.objects.filter(
            owner_id=config.pk, status__in=('pending', 'deferred'), spent=0, record_id='',
            actor_id__in=Agent.objects.filter(archived_at__isnull=True).values('pk'),
        ).filter(Q(activity='post_publish') | Q(activity='unplanned', context__daily_choice__plan__activity='post_publish'))
        .exclude(actor_id__in=config.paused_agents)
        .filter(Q(context__manual__isnull=True) | Q(context__manual=False))
        .filter(Q(context__execution_started__isnull=True) | Q(context__execution_started=''))
        .alias(execution_id=_execution_id()).filter(~Exists(WorldAction.objects.filter(pk=OuterRef('execution_id'))))
        .filter(pk__gt=_scan_after.get(config.pk, '')).order_by('pk')
    )
    rows = list(pending.only('owner_id', 'actor_id', 'scheduled_at')[:INTENTION_BATCH_SIZE])
    actors = Agent.objects.only('pk').in_bulk({row.actor_id for row in rows})
    usage = {}
    for row in rows:
        agent = actors.get(row.actor_id)
        if agent is None:
            continue
        at = max(local_time(row.scheduled_at), now)
        period = quota_bounds(task.publish_config, at)
        if period not in usage:
            usage[period] = quota_usage(task, now=at)
        if quota_reason(task, agent, task.publish_config, quota=usage[period]):
            replan_if_blocked(row, now=now, background=True)

    if len(rows) == INTENTION_BATCH_SIZE:
        _scan_after[config.pk] = rows[-1].pk
    else:
        _scan_after.pop(config.pk, None)
