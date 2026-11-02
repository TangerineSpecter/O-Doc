"""Read validated daily contributions while original fishing events remain."""
from collections import defaultdict
from datetime import time

from system_settings.sync_state import canonical_hash
from utils.sync_datetime import SyncJSONEncoder
from ..fishing.analytics_models import FishingTripCoverage, FishingTripDay
from ..fishing.daily import COUNTERS
from ..fishing.models import FishingTrip
from ..life_time import local_time


def load_daily_fishing(owner, actors, start, end):
    first_at, end_at = local_time(start), local_time(end)
    if first_at.time() != time.min or end_at.time() != time.min or first_at >= end_at:
        return set(), {}
    first, last = first_at.date(), end_at.date()
    candidates = FishingTripDay.objects.filter(owner_id=owner, actor_id__in=actors,
                                                day__gte=first, day__lt=last).values('trip_id')
    markers = list(FishingTripCoverage.objects.filter(owner_id=owner, actor_id__in=actors, pk__in=candidates))
    identities = [row.pk for row in markers]
    trips = {row.pk: row for row in FishingTrip.objects.filter(pk__in=identities, owner_id=owner).only(
        'id', 'owner_id', 'actor_id', 'status', 'revision', 'ended_at')}
    days_by_trip = defaultdict(list)
    for row in FishingTripDay.objects.filter(trip_id__in=identities).order_by('trip_id', 'day'):
        days_by_trip[row.trip_id].append(row)
    covered, totals = set(), defaultdict(lambda: dict.fromkeys(COUNTERS, 0))
    encoder = SyncJSONEncoder()
    for marker in markers:
        source = marker.source if isinstance(marker.source, dict) else {}
        trip, rows = trips.get(marker.pk), days_by_trip[marker.pk]
        daily = [{'date': row.day.isoformat(), 'first_sequence': row.first_sequence,
                  'last_sequence': row.last_sequence, 'counters': row.counters} for row in rows]
        if (marker.version != 1 or not trip or not trip.ended_at or trip.status not in ('completed', 'cancelled')
                or marker.actor_id != trip.actor_id or source.get('owner_id') != owner
                or source.get('actor_id') != trip.actor_id or source.get('trip_id') != marker.pk
                or source.get('revision') != trip.revision or source.get('status') != trip.status
                or source.get('ended_at') != encoder.default(trip.ended_at)
                or any(row.owner_id != owner or row.actor_id != trip.actor_id for row in rows)
                or marker.days != [row['date'] for row in daily] or source.get('days_digest') != canonical_hash(daily)):
            continue
        if any(not isinstance(day['counters'], dict) or set(day['counters']) != set(COUNTERS)
               or any(type(value) is not int or value < 0 for value in day['counters'].values()) for day in daily):
            continue
        covered.add(marker.pk)
        for day in daily:
            if first.isoformat() <= day['date'] < last.isoformat():
                for key, value in day['counters'].items():
                    totals[trip.actor_id][key] += value
    return covered, dict(totals)
