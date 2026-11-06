"""Batch transactions are confined to the writer's own database connection."""
from datetime import datetime, timedelta, timezone as utc
import time
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone

from .metrics import DEFAULT_POLICY, digest, distribution, histogram_schema, valid_distribution
from .models import PerformancePolicy, PerformanceBucket, PerformanceSample, PerformanceFlushBatch, DatabaseStatSnapshot, PerformanceInflight
from .capacity import Budget, estimate, ROW_OVERHEAD

_dimension_keys = set()
_dimension_day = None


def checkpoint_inflight(states):
    if not states:
        return
    with transaction.atomic():
        _timeouts()
        config = PerformancePolicy.objects.select_for_update().get(pk=1)
        budget = Budget(config)
        for state in states:
            if state['generation'] == config.generation:
                existing = PerformanceInflight.objects.filter(pk=state['id']).first()
                growth = max(0, estimate(PerformanceInflight, {'state': state}) - (estimate(PerformanceInflight, existing) if existing else 0))
                if budget.reserve(growth):
                    PerformanceInflight.objects.update_or_create(pk=state['id'], defaults={'updated': timezone.now(), 'state': state})
        budget.save()


def load_policy():
    row, _ = PerformancePolicy.objects.get_or_create(pk=1)
    return {**DEFAULT_POLICY, **{key: value for key, value in row.value.items() if key in DEFAULT_POLICY},
            'capacity': row.value.get('_storage', {}), 'version': row.version, 'generation': row.generation}


def _timeouts():
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '100ms'")
            cursor.execute("SET LOCAL statement_timeout = '2000ms'")


@transaction.atomic
def persist(events: list[dict], batch_id: str):
    global _dimension_day, _dimension_keys
    _timeouts()
    policy = PerformancePolicy.objects.select_for_update().get(pk=1)
    if _dimension_day != timezone.now().date():
        _dimension_day, _dimension_keys = timezone.now().date(), set()
    if PerformanceFlushBatch.objects.filter(pk=batch_id).exists():
        return dict(duplicate=True, rejected_events=0, discarded_samples=0)
    groups = {}
    samples = []
    for event in events:
        if event['generation'] != policy.generation:
            continue
        dimensions = {key: event.get(key) for key in ('kind', 'operation', 'status', 'policy_version', 'method', 'model_name', 'provider_name')}
        dimensions['build'] = event['build']
        dimensions['histogram_schema'] = histogram_schema()
        minute = datetime.fromtimestamp(event['started'], utc.utc).replace(second=0, microsecond=0)
        key = digest(dimensions)
        if key not in _dimension_keys and len(_dimension_keys) >= 2048:
            dimensions = dict(kind=event['kind'], operation='其他（超过本进程每日维度上限）', status=event['status'],
                              policy_version=event['policy_version'], method=None, build={}, histogram_schema=histogram_schema())
            key = digest(dimensions)
        _dimension_keys.add(key)
        bucket = groups.setdefault((key, minute), dict(dimensions=dimensions, count=0, errors=0, slow=0,
                                                      total_ms=0, max_ms=0, histogram=distribution([]), sql_count=0, sql_ms=0))
        bucket['count'] += 1
        bucket['errors'] += int(event['status'] in {'failed', 'timeout'})
        bucket['slow'] += int(event['slow'])
        bucket['total_ms'] += event['duration_ms']
        bucket['max_ms'] = max(bucket['max_ms'], event['duration_ms'])
        bucket['histogram'] = [a + b for a, b in zip(bucket['histogram'], distribution([event['duration_ms']]))]
        bucket['sql_count'] += event.get('sql_count', 0)
        bucket['sql_ms'] += event.get('sql_ms', 0)
        if event['slow'] or event['status'] in {'failed', 'timeout'} or event.get('interesting') or int(event['id'][:4], 16) % 100 == 0:
            samples.append(PerformanceSample(id=event['id'], created=datetime.fromtimestamp(event['started'], utc.utc),
                                             kind=event['kind'], operation=event['operation'], duration_ms=event['duration_ms'],
                                             status=event['status'], evidence=event))
    budget = Budget(policy)
    lookup = Q(pk__in=[])
    for key, minute in groups:
        lookup |= Q(key=key, minute=minute)
    existing = {(row.key, row.minute): row for row in PerformanceBucket.objects.select_for_update().filter(lookup)}
    required = ROW_OVERHEAD + sum(estimate(PerformanceBucket, data) for identity, data in groups.items() if identity not in existing)
    if not budget.reserve(required):
        budget.state['rejected_events'] += len(events)
        budget.save()
        return dict(rejected_events=len(events), discarded_samples=0, capacity=budget.info())
    retained, skipped = [], 0
    for sample in samples:
        if budget.reserve(estimate(PerformanceSample, sample), detail=True):
            retained.append(sample)
        else:
            skipped += 1
    for (key, minute), data in groups.items():
        row = existing.get((key, minute))
        if row is None:
            PerformanceBucket.objects.create(key=key, minute=minute, **data)
        else:
            histogram_valid = valid_distribution(row.histogram, data['dimensions']['histogram_schema']['bounds'], row.count)
            for name in ('count', 'errors', 'slow', 'total_ms', 'sql_count', 'sql_ms'):
                setattr(row, name, getattr(row, name) + data[name])
            row.max_ms = max(row.max_ms, data['max_ms'])
            row.histogram = [row.histogram[i] + data['histogram'][i] for i in range(len(data['histogram']))] if histogram_valid else []
            row.save()
    PerformanceSample.objects.bulk_create(retained, ignore_conflicts=True)
    PerformanceInflight.objects.filter(pk__in=[event['id'] for event in events]).delete()
    PerformanceFlushBatch.objects.create(id=batch_id)
    budget.state['discarded_samples'] += skipped
    budget.save()
    return dict(rejected_events=0, discarded_samples=skipped, capacity=budget.info())


@transaction.atomic
def save_policy(changes: dict, clear=False):
    row = PerformancePolicy.objects.select_for_update().get(pk=1)
    if clear:
        row.generation += 1
        PerformanceBucket.objects.all().delete()
        PerformanceSample.objects.all().delete()
        DatabaseStatSnapshot.objects.all().delete()
        PerformanceInflight.objects.all().delete()
        PerformanceFlushBatch.objects.all().delete()
        row.value = {**row.value, '_storage': dict(used_bytes=ROW_OVERHEAD, limited=False, discarded_samples=0, rejected_events=0)}
    else:
        row.value = {**row.value, **changes}
        row.version += 1
    row.save()
    return load_policy()


@transaction.atomic
def _delete_old(model, cutoff, field='created'):
    _timeouts()
    ids = list(model.objects.filter(**{f'{field}__lt': cutoff}).order_by(field).values_list('pk', flat=True)[:100])
    if ids:
        model.objects.filter(pk__in=ids).delete()


def maintain():
    config = load_policy()
    now = timezone.now()
    _delete_old(PerformanceSample, now - timedelta(days=config['sample_days']))
    _delete_old(PerformanceBucket, now - timedelta(days=config['aggregate_days']), 'minute')
    _delete_old(DatabaseStatSnapshot, now - timedelta(days=7))
    _delete_old(PerformanceFlushBatch, now - timedelta(hours=24))
    _delete_old(PerformanceInflight, now - timedelta(days=1), 'updated')
    # Each pass is short; pressure causes another pass without waiting a minute.
    # New records cannot outgrow the budget while this cleanup catches up.
    with transaction.atomic():
        _timeouts()
        policy = PerformancePolicy.objects.select_for_update().get(pk=1)
        budget = Budget(policy)
        budget.reconcile()
        deadline = time.monotonic() + 1
        while budget.state['limited'] and time.monotonic() < deadline:
            deleted = False
            for model in (PerformanceSample, DatabaseStatSnapshot, PerformanceBucket):
                oldest = 'minute' if model is PerformanceBucket else 'created'
                ids = list(model.objects.order_by(oldest, 'pk').values_list('pk', flat=True)[:100])
                if ids:
                    model.objects.filter(pk__in=ids).delete()
                    deleted = True
                    break
            if not deleted:
                break  # active inflight / unexpired dedup markers are protected
            budget.reconcile()
        budget.save()
        return budget.info()


@transaction.atomic
def save_database_snapshot(state):
    _timeouts()
    policy = PerformancePolicy.objects.select_for_update().get(pk=1)
    budget = Budget(policy)
    if budget.reserve(estimate(DatabaseStatSnapshot, {'state': state}), detail=True):
        DatabaseStatSnapshot.objects.create(created=timezone.now(), state=state)
    budget.save()
