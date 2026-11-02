"""Read-only fishing activity, using each fact's occurrence time within the window."""
from ..fishing.daily import statistics_values
from ..fishing.models import FishingTrip, FishingEvent


class InvalidFishingStatisticsSource(ValueError):
    """A retained event cannot safely contribute to fishing statistics."""

    def __init__(self, trip_id, event_id, reason):
        self.trip_id, self.event_id, self.reason = trip_id, event_id, reason
        super().__init__(f'出钓 {trip_id}、事件 {event_id}：{reason}')


def load_fishing_statistics(owner, start, end, residents, *, include_daily=False):
    rows = {actor: {**resident, 'trips': 0, 'casts': 0, 'catches': 0, 'kings': 0,
                   'escaped': 0, 'empty': 0, 'junk': 0, 'experience': 0,
                   'ordinaryCatches': 0, 'ordinaryCatchRate': None}
            for actor, resident in residents.items()}
    trips = FishingTrip.objects.filter(owner_id=owner, actor_id__in=rows)
    for actor in trips.filter(departed_at__gte=start, departed_at__lt=end).values_list('actor_id', flat=True):
        rows[actor]['trips'] += 1
    covered = set()
    if include_daily:
        from .fishing_daily import load_daily_fishing
        covered, totals = load_daily_fishing(owner, rows, start, end)
        for actor, counters in totals.items():
            for key, value in counters.items():
                rows[actor][key] += value
    # Event facts are counted even if their trip departed before the selected dates.
    events = FishingEvent.objects.filter(trip__owner_id=owner, trip__actor_id__in=rows,
        created_at__gte=start, created_at__lt=end, kind__in=['cast', 'duel_end']).exclude(trip_id__in=covered)
    for actor, kind, data, trip_id, event_id in events.values_list('trip__actor_id', 'kind', 'data', 'trip_id', 'pk'):
        try:
            experience, outcome, caught = statistics_values(kind, data)
        except ValueError as exc:
            raise InvalidFishingStatisticsSource(trip_id, event_id, str(exc)) from exc
        row = rows[actor]
        row['experience'] += experience
        if kind == 'cast':
            row['casts'] += 1
            if outcome in ('escaped', 'empty', 'junk'):
                row[outcome] += 1
        if caught:
            row['catches'] += 1
            row['kings'] += int(bool(caught.get('king')))
            if kind == 'cast' and not caught.get('king'):
                row['ordinaryCatches'] += 1
    for row in rows.values():
        attempts = row['ordinaryCatches'] + row['escaped']
        row['ordinaryCatchRate'] = round(100 * row['ordinaryCatches'] / attempts, 1) if attempts else None
    return sorted(rows.values(), key=lambda row: (-row['catches'], -row['kings'], -row['experience'], row['id']))
