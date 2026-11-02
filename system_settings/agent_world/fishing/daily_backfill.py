"""Materialize bounded trip-day statistics without deleting fishing facts."""
import json
import time

from django.core import serializers
from django.db import transaction
from django.db.models import Exists, OuterRef

from utils.sync_datetime import SyncJSONEncoder
from utils.sync_policy import SyncError
from ..combat.migration_guard import is_protected
from ..farm_gate import guarded
from .analytics_models import FishingTripCoverage, FishingTripDay
from .daily import project_trip
from .daily_sync import records
from .models import FishingEvent, FishingTrip


@guarded
@transaction.atomic
def backfill(owner, identity, *, max_source_rows=20000):
    if not is_protected():
        raise ValueError('请先在本进程启用 ODOC_COMBAT_BACKFILL_PROTECT=1，并按迁移方案隔离其他设备')
    trip = FishingTrip.objects.select_for_update().filter(pk=identity, owner_id=owner).first()
    if trip is None:
        raise ValueError('未找到该账号的出钓记录')
    events = FishingEvent.objects.filter(trip_id=identity).order_by('sequence')
    count = events.count()+1
    if count > max_source_rows:
        raise ValueError(f'钓鱼来源共 {count} 行，超过本次回填上限 {max_source_rows}')
    data = json.loads(serializers.serialize('json', [trip, *events], cls=SyncJSONEncoder))
    projection = project_trip(data, identity)
    expected = records(projection)
    existing = json.loads(serializers.serialize('json', [*FishingTripCoverage.objects.filter(pk=identity),
        *FishingTripDay.objects.filter(trip_id=identity)], cls=SyncJSONEncoder))
    existing = {(row['model'], str(row['pk'])): row for row in existing}
    expected_map = {(row['model'], str(row['pk'])): row for row in expected}
    if existing:
        if existing != expected_map:
            raise ValueError('该出钓已有不同的统计来源，保留原数据并暂停自动覆盖')
        return {'created': False, 'trip_id': identity, 'days': len(projection['days']), 'cleanup_ready': False}
    FishingTripCoverage.objects.create(pk=identity, **expected[0]['fields'])
    for row in expected[1:]:
        FishingTripDay.objects.create(pk=row['pk'], **row['fields'])
    return {'created': True, 'trip_id': identity, 'days': len(projection['days']), 'cleanup_ready': False}


def backfill_batch(owner=None, *, after='', limit=5, max_source_rows=20000, max_seconds=10):
    if not is_protected():
        raise ValueError('请先在本进程启用 ODOC_COMBAT_BACKFILL_PROTECT=1，并按迁移方案隔离其他设备')
    if not 1 <= limit <= 50 or not 1 <= max_source_rows <= 50000 or not 1 <= max_seconds <= 60:
        raise ValueError('回填批次大小、来源行数或时间上限无效')
    coverage = FishingTripCoverage.objects.filter(pk=OuterRef('pk'))
    query = FishingTrip.objects.filter(status__in=('completed', 'cancelled'), ended_at__isnull=False, pk__gt=after)\
        .alias(has_coverage=Exists(coverage)).filter(has_coverage=False).order_by('pk')
    if owner:
        query = query.filter(owner_id=owner)
    candidates = list(query.values_list('pk', 'owner_id')[:limit])
    started = time.monotonic()
    processed, created, failures, cursor = 0, 0, [], after
    for identity, account in candidates:
        if processed and time.monotonic()-started >= max_seconds:
            break
        try:
            result = backfill(account, identity, max_source_rows=max_source_rows)
            created += int(result['created'])
        except (ValueError, KeyError, TypeError, AttributeError, SyncError) as exc:
            failures.append({'trip_id': identity, 'owner_id': account, 'reason': str(exc)})
        processed += 1
        cursor = identity
    return {'processed': processed, 'created': created, 'failures': failures, 'next_after': cursor,
            'has_more': query.filter(pk__gt=cursor).exists() if processed else bool(candidates),
            'cleanup_ready': False}
