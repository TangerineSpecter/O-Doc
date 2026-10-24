"""One read projection for exploration and fishing occupancy on resident cards."""
from collections import defaultdict


def resident_presence(owner=None):
    from .combat.queries import resident_presence as exploration_presence
    from .fishing.models import FishingTrip
    from .fishing.service import authorized_trip_ids
    result = exploration_presence(owner)
    rows = FishingTrip.objects.filter(ended_at__isnull=True)
    if owner is not None:
        rows = rows.filter(owner_id=owner)
    groups = defaultdict(list)
    for trip in rows:
        groups[trip.owner_id].append(trip)
    for account, trips in groups.items():
        permitted = authorized_trip_ids(trips, account)
        for trip in trips:
            paused = trip.status == 'paused' or trip.pk not in permitted or bool(trip.state.get('error'))
            label = '出钓暂停，等待恢复或返程' if paused else {
                'preparing': '准备出钓', 'active': '钓鱼中', 'duel': '鱼王对决',
            }.get(trip.status, '出钓等待收尾')
            result[trip.actor_id] = {'status': 'idle' if paused else 'running', 'current_action': label}
    return result
