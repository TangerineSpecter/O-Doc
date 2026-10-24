"""Bounded, model-free settlement of abandoned activities and busy-only failures.

Uses existing domain terminal transactions and synchronized facts. Revoked local
permits never authorize another cast, battle round, or provider request.
"""
import logging
from datetime import datetime, timedelta

from django.db import transaction

from .farm_gate import guarded
from .life_activities import is_interleaved, main_items
from .life_models import LifeItem
from .life_time import local_time, storage_time

logger = logging.getLogger(__name__)
BUSY_REASON = '居民正在执行其他任务，请稍后重试'


def return_deadline_passed(end, now):
    return bool(end and now > local_time(end) + timedelta(seconds=5))


def stop_reason(item, created_at, end, now, *, stalled=False):
    if return_deadline_passed(end, now):
        return '系统说明：已到返程时间，中断期间不补跑，保留已有成果'
    if not end:
        expires = item.context.get('interleaving', {}).get('expires_at') if item else None
        limit = local_time(datetime.fromisoformat(expires)) if expires else local_time(created_at) + timedelta(minutes=30)
        if now >= limit:
            return '系统说明：准备期限已过，结束本次准备并释放居民'
    if stalled and item and is_interleaved(item):
        due = main_items(LifeItem.objects.filter(owner_id=item.owner_id, actor_id=item.actor_id,
            status__in=('pending', 'deferred'), scheduled_at__lte=storage_time(now))).exclude(pk=item.pk)
        if due.exists():
            return '系统说明：自由活动已暂停或等待恢复，为到期主日程提前返回'
    return ''


@guarded
@transaction.atomic
def recover_fishing(identity, now):
    from .fishing.models import FishingTrip
    from .fishing.service import authorized, finish
    trip = FishingTrip.objects.select_for_update().get(pk=identity)
    if trip.ended_at:
        return
    item = LifeItem.objects.filter(pk=trip.life_item_id).first()
    stalled = trip.status == 'paused' or bool(trip.state.get('error')) or not authorized(trip)
    end = trip.deadline
    if end and trip.status == 'duel' and not stalled:
        end = local_time(end) + timedelta(minutes=5)
    reason = stop_reason(item, trip.created_at, end, now, stalled=stalled)
    if reason:
        finish(identity, reason, cancelled=not bool(trip.departed_at))


@guarded
@transaction.atomic
def recover_exploration(identity, now):
    from .combat.models import Exploration
    from .combat.recovery import deadline
    from .combat.permissions import local_runtime
    from .combat.explorations import finish
    run = Exploration.objects.select_for_update().get(pk=identity)
    if run.ended_at:
        return
    item = LifeItem.objects.filter(pk=run.life_item_id).first()
    runtime = local_runtime(run)
    end = deadline(run)
    reason = stop_reason(item, run.created_at, end, now,
        stalled=run.status == 'paused' or (run.status == 'preparing' and bool(run.snapshot.get('preparation_retry_at')))
        or not runtime or not runtime.authorized)
    if reason:
        # Promotion belongs to the durable profile/runtime and remains retryable;
        # an abandoned outing must not reserve the resident forever.
        # Reaching the return deadline is completion, including after a pause.
        status = 'completed' if return_deadline_passed(end, now) else 'recalled' if end else 'interrupted'
        finish(identity, status, reason, now)


def reconcile(now=None, *, domain=None):
    """One bad record cannot prevent other residents from being released."""
    from .fishing.models import FishingTrip
    from .combat.models import Exploration
    now = local_time(now)
    groups = []
    if domain in (None, 'fishing'):
        groups.append((FishingTrip.objects.filter(ended_at__isnull=True), recover_fishing))
    if domain in (None, 'exploration'):
        groups.append((Exploration.objects.filter(status__in=('preparing', 'active', 'paused', 'settling')), recover_exploration))
    for rows, recover in groups:
        for identity in rows.values_list('pk', flat=True):
            try:
                recover(identity, now)
            except Exception:
                logger.exception('活动收尾失败，保留事实并在下轮重试 activity=%s id=%s', recover.__name__, identity)


@guarded
@transaction.atomic
def requeue_busy_failures(config, now):
    """Repair only pre-model busy failures from the current day, once per item."""
    from .life_schedule import requeue
    from system_settings.models import Agent, WorldAction
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    rows = main_items(LifeItem.objects.select_for_update().filter(owner_id=config.pk,
        activity='unplanned', status='failed', record_id='', result__reason=BUSY_REASON,
        scheduled_at__gte=storage_time(start), scheduled_at__lt=storage_time(start + timedelta(days=1)))).exclude(
            actor_id__in=Agent.objects.filter(archived_at__isnull=False).values('pk'))
    for item in rows:
        if item.actor_id in config.paused_agents or any(item.context.get(key) for key in (
                'execution_started', 'execution_key', 'daily_choice', 'farm_plan_id', 'travel_plan',
                'cooking_plan', 'alchemy_plan', 'lottery_plan', 'lottery_target')):
            continue
        if item.spent or WorldAction.objects.filter(pk=item.pk).exists():
            continue
        requeue(item, '系统说明：恢复仅因居民忙碌而失败、尚未执行的主日程')
