"""只读查询；图鉴由捕获事实派生，不在 GET 中创建居民档案。"""
from collections import Counter
from .models import FishingProfile, FishingTrip, FishingEvent
from .catalog import current
from .rules import level_for
from .service import inventory
from ..life_time import local_time


def summary(owner: str, actor: str) -> dict:
    rules = current(owner)
    profile = FishingProfile.objects.filter(pk=actor, owner_id=owner).first()
    level, progress, needed = level_for(profile.experience if profile else 0, rules['max_level'])
    stock = inventory(owner, actor)
    recent = FishingEvent.objects.filter(trip__owner_id=owner, trip__actor_id=actor,
        data__catch__isnull=False).order_by('-created_at')[:3]
    return {'level': level, 'experience': profile.experience if profile else 0,
            'progress': progress, 'needed': needed,
            'baits': [{'id': key, 'name': rules['baits'][key]['name'], 'quantity': count}
                      for key, count in stock.items() if key in rules['baits']],
            'spots': [{'id': key, **value} for key, value in rules['spots'].items() if value['required_level'] <= level],
            'recent_catches': [event.data['catch']['name'] for event in recent]}


def discovery(owner: str, actor: str = '') -> dict:
    rows = FishingEvent.objects.filter(trip__owner_id=owner, data__catch__isnull=False)
    if actor:
        rows = rows.filter(trip__actor_id=actor)
    result = {}
    for row in rows.order_by('created_at', 'id'):
        catch = row.data['catch']
        entry = result.setdefault(catch['fish_id'], {'count': 0, 'max_weight': 0,
            'first_caught_at': catch['caught_at'], 'record_actor': row.trip.actor_name})
        entry['count'] += 1
        if catch['weight'] > entry['max_weight']:
            entry.update(max_weight=catch['weight'], record_actor=row.trip.actor_name)
    return result


def trip_data(trip: FishingTrip, *, detail: bool = False, event_page: int = 1) -> dict:
    from .service import authorized
    caught = [row.data['catch'] for row in trip.events.filter(data__catch__isnull=False)]
    names = Counter(c['name'] for c in caught)
    state = trip.state
    result = {'id': trip.pk, 'actor_id': trip.actor_id, 'actor_name': trip.actor_name,
        'status': trip.status, 'plan': state['plan'], 'casts': state['casts'],
        'carried': [{'name': p['name'], 'quantity': p['quantity'], 'sku': p['source']['sku']} for p in state['carried']],
        'duel': state.get('duel'), 'error': state.get('error', ''), 'reason': state.get('reason', ''),
        'catches': [{'name': name, 'quantity': n} for name, n in names.items()],
        'experience': sum(e.data.get('experience', 0) for e in trip.events.all()),
        'authorized': authorized(trip) if not trip.ended_at else False,
        'departed_at': local_time(trip.departed_at).isoformat() if trip.departed_at else None,
        'deadline': local_time(trip.deadline).isoformat() if trip.deadline else None,
        'created_at': local_time(trip.created_at).isoformat(),
        'ended_at': local_time(trip.ended_at).isoformat() if trip.ended_at else None}
    if detail:
        events = trip.events.order_by('-sequence')
        result.update(events=[{'id': e.pk, 'kind': e.kind, 'data': e.data,
            'created_at': local_time(e.created_at).isoformat()} for e in events[(event_page - 1)*30:event_page*30]],
            event_total=events.count(), event_page=event_page, rules=trip.rules)
    return result
