"""Defer normal occupancy without exhausting a task's business retry allowance."""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .farm_gate import guarded
from .life_models import LifeItem
from .life_schedule import OPEN, _next_free_slot, revise, window
from .life_time import local_time


def occupied(item) -> bool:
    from system_settings.models import AgentExecutionLease
    from .combat.schedule import occupied_ids
    from .travel_candidates import travelling_ids
    from .market_models import MarketSession
    from .fishing.models import FishingTrip
    return (FishingTrip.objects.filter(actor_id=item.actor_id, ended_at__isnull=True).exclude(life_item_id=item.pk).exists()
            or item.actor_id in occupied_ids() or item.actor_id in travelling_ids()
            or AgentExecutionLease.objects.filter(agent_id=item.actor_id, until__gt=timezone.now()).exists()
            or LifeItem.objects.filter(actor_id=item.actor_id, status='running').exclude(pk=item.pk).exists()
            or MarketSession.objects.filter(actor_id=item.actor_id, status='active', expires_at__gt=timezone.now()).exists())


@guarded
@transaction.atomic
def defer_busy(item, config) -> None:
    from .life_config import DEFAULTS, effective_settings
    item = LifeItem.objects.select_for_update().get(pk=item.pk)
    if item.status not in ('pending', 'deferred'):
        return
    settings = {**DEFAULTS, **effective_settings(config)}
    point = local_time() + timedelta(minutes=settings['min_gap_minutes'])
    others = list(LifeItem.objects.filter(owner_id=item.owner_id, actor_id=item.actor_id,
                  status__in=OPEN).exclude(pk=item.pk).values_list('scheduled_at', flat=True))
    farm_days = {local_time(at).date() for at in LifeItem.objects.filter(owner_id=item.owner_id,
                 actor_id=item.actor_id, status__in=OPEN, activity='farm').exclude(pk=item.pk).values_list('scheduled_at', flat=True)}
    while True:
        day = point.date()
        existing = [local_time(at) for at in others if local_time(at).date() == day]
        candidate = None if item.activity == 'farm' and day in farm_days else _next_free_slot(point, settings, existing)
        if candidate is not None:
            break
        point = window(settings, day + timedelta(days=1))[0]
    context = dict(item.context)
    if candidate.date() != local_time(item.scheduled_at).date():
        if item.activity == 'farm' and context.get('farm_plan_id'):
            from .farm_queue_schedule import cancel
            cancel(item, '前一活动仍在持续，跨日后重新准备队列')
            context.pop('farm_plan_id')
        context['planned_on'] = candidate.date().isoformat()
    reason = '前一活动仍在持续，移至可用空档等待执行'
    last = item.revisions.order_by('-created_at').first()
    if (item.status == 'deferred' and last and last.reason == reason
            and candidate.date() == local_time(item.scheduled_at).date() and not item.context.get('farm_plan_id')):
        item.scheduled_at, item.context = candidate, context
        item.save()
    else:
        revise(item, reason, status='deferred', scheduled_at=candidate, context=context)
