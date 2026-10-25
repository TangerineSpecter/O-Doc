"""Read-only projections and owner-scoped appointment actions via the life API."""
from .reservation_models import AdventureReservation, AdventurePlanningDay
from ..life_time import local_time


def summary(item):
    row = AdventureReservation.objects.get(pk=item.context['adventure_reservation_id'], owner_id=item.owner_id)
    from .store import current
    from .models import CombatProfile
    profile = CombatProfile.objects.filter(pk=item.actor_id).first()
    dungeon_name = current(profile.catalog_id).row('dungeons', row.dungeon_id)['name'] if profile else row.dungeon_id
    return {'dungeon_name': dungeon_name, 'id': row.pk, 'status': row.status, 'dungeon_id': row.dungeon_id,
            'prepare_at': local_time(row.prepare_at).isoformat(), 'starts_at': local_time(row.starts_at).isoformat(),
            'ends_at': local_time(row.ends_at).isoformat(), 'duration_seconds': int((row.ends_at-row.starts_at).total_seconds()),
            'members': [{k: member[k] for k in ('actor_id', 'name', 'job_id', 'duration_seconds', 'status')} for member in row.snapshot['members'].values()],
            'reason': row.snapshot.get('reason', ''), 'run_id': item.context.get('exploration_id') or row.snapshot['members'][item.actor_id]['run_id']}


def change(item, action, reason):
    from .reservation_execution import cancel
    from .models import CombatRuntime
    row = AdventureReservation.objects.select_for_update().get(pk=item.context['adventure_reservation_id'], owner_id=item.owner_id)
    if action == 'retry':
        from ..life_scope import check_item_authorization
        check_item_authorization(item)
        if row.status not in ('reserved', 'preparing') or local_time() >= local_time(row.starts_at):
            raise ValueError('只能授权尚未出发的预约')
        CombatRuntime.objects.update_or_create(pk=row.pk, defaults={'owner_id': row.owner_id, 'authorized': True, 'requests': {'origin': row.snapshot['origin']}})
        from .models import Exploration
        for member in row.snapshot['members'].values():
            run = Exploration.objects.filter(pk=member['run_id'], status='preparing').first()
            if run:
                CombatRuntime.objects.update_or_create(pk=run.pk, defaults={'owner_id': row.owner_id, 'authorized': True, 'requests': {'origin': run.snapshot['origin']}})
    elif action == 'cancel':
        cancel(row, reason)
    else:
        raise ValueError('组队预约仅支持取消或恢复本机授权；请通过主日程重新规划来重新配队')


def invalidate_for_item(item, reason):
    from .reservation_execution import cancel
    for row in AdventureReservation.objects.filter(owner_id=item.owner_id, status__in=('reserved', 'preparing'), planning_day__day=local_time(item.scheduled_at).date()):
        if item.actor_id not in row.snapshot.get('members', {}):
            continue
        cancel(row, '成员日程变更，预约失效：'+reason)
        day = row.planning_day
        day.status = 'planning'
        # Preserve the existing exploration intention; only explicit replanning asks again.
        if '重新规划' in reason:
            day.snapshot.get('intents', {}).pop(item.actor_id, None)
        day.save()


def planning_summary(owner, start, end, actor=''):
    result = []
    for day in AdventurePlanningDay.objects.filter(owner_id=owner, day__gte=local_time(start).date(), day__lte=local_time(end).date()):
        for identity, intent in day.snapshot.get('intents', {}).items():
            if actor and actor != identity:
                continue
            result.append({'day': str(day.day), 'actor_id': identity, 'name': intent.get('name', ''),
                'participate': intent['participate'], 'dungeon_id': intent.get('dungeon_id'),
                'duration_seconds': intent.get('duration_seconds'), 'status': day.status,
                'reason': day.snapshot.get('unmatched', {}).get(identity) or intent['reason']})
    return result
