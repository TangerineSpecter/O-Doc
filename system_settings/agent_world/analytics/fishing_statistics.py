"""Read-only fishing activity, using each fact's occurrence time within the window."""
from ..fishing.models import FishingTrip, FishingEvent


def load_fishing_statistics(owner, start, end, residents):
    rows = {actor: {**resident, 'trips': 0, 'casts': 0, 'catches': 0, 'kings': 0,
                   'escaped': 0, 'empty': 0, 'junk': 0, 'experience': 0,
                   'ordinaryCatches': 0, 'ordinaryCatchRate': None}
            for actor, resident in residents.items()}
    trips = FishingTrip.objects.filter(owner_id=owner, actor_id__in=rows)
    for actor in trips.filter(departed_at__gte=start, departed_at__lt=end).values_list('actor_id', flat=True):
        rows[actor]['trips'] += 1
    # Event facts are counted even if their trip departed before the selected dates.
    events = FishingEvent.objects.filter(trip__owner_id=owner, trip__actor_id__in=rows,
        created_at__gte=start, created_at__lt=end, kind__in=['cast', 'duel_end'])
    for actor, kind, data in events.values_list('trip__actor_id', 'kind', 'data'):
        row = rows[actor]
        row['experience'] += data.get('experience', 0)
        if kind == 'cast':
            row['casts'] += 1
            outcome = data.get('outcome', {}).get('kind')
            if outcome in ('escaped', 'empty', 'junk'):
                row[outcome] += 1
        caught = data.get('catch')
        if caught:
            row['catches'] += 1
            row['kings'] += int(bool(caught.get('king')))
            if kind == 'cast' and not caught.get('king'):
                row['ordinaryCatches'] += 1
    for row in rows.values():
        attempts = row['ordinaryCatches'] + row['escaped']
        row['ordinaryCatchRate'] = round(100 * row['ordinaryCatches'] / attempts, 1) if attempts else None
    return sorted(rows.values(), key=lambda row: (-row['catches'], -row['kings'], -row['experience'], row['id']))
