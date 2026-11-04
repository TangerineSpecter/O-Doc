"""Incrementally save legacy solo outcomes without removing source facts."""
import json
import time

from django.core import serializers
from django.db import transaction
from django.db.models import Exists, OuterRef, Q

from utils.sync_datetime import SyncJSONEncoder
from utils.sync_policy import SyncError
from ..farm_gate import guarded
from .analytics_models import CombatSoloSettlement
from .explorations import TERMINAL
from .migration_guard import is_protected
from .models import CombatEncounter, CombatFact, Exploration
from .solo_settlement import project, record
from .summary_verification import MAX_ACTOR_ROWS, verify_actors


def legacy_runs():
    """Select terminal solo explorations; failed preparations without a battle are ignored."""
    facts = CombatFact.objects.filter(exploration_id=OuterRef('pk'), actor_id=OuterRef('actor_id'),
                                      owner_id=OuterRef('owner_id'), kind__in=('depart', 'round'))
    encounters = CombatEncounter.objects.filter(exploration_id=OuterRef('pk'), actor_id=OuterRef('actor_id'),
                                                 owner_id=OuterRef('owner_id'))
    return (Exploration.objects.filter(status__in=TERMINAL).exclude(snapshot__has_key='party_id')
            .alias(has_fact=Exists(facts), has_encounter=Exists(encounters))
            .filter(~Q(status='failed') | Q(has_fact=True) | Q(has_encounter=True)))


def _backfill(owner, identity, max_source_rows, max_actor_rows, verified):
    run = Exploration.objects.select_for_update().filter(pk=identity, owner_id=owner).first()
    if not run or run.status not in TERMINAL or not run.ended_at or 'party_id' in (run.snapshot or {}):
        raise ValueError('旧单人探索尚未结束或来源无效')
    newly_verified = verify_actors(owner, {run.actor_id}, max_actor_rows, verified)
    queries = (Exploration.objects.filter(pk=identity), CombatFact.objects.filter(exploration_id=identity),
               CombatEncounter.objects.filter(exploration_id=identity))
    count = sum(query.order_by().count() for query in queries)
    if max_source_rows is not None and count > max_source_rows:
        raise ValueError(f'旧单人来源共 {count} 行，超过本次回填上限 {max_source_rows}')
    data = []
    for query in queries:
        data.extend(json.loads(serializers.serialize('json', query, cls=SyncJSONEncoder)))
    expected = record(project(data, identity))
    previous = list(CombatSoloSettlement.objects.filter(pk=identity))
    if previous:
        current = json.loads(serializers.serialize('json', previous, cls=SyncJSONEncoder))[0]
        if current != expected:
            raise ValueError('旧单人探索已有不同结算，保留原数据并暂停自动覆盖')
        return False, newly_verified
    CombatSoloSettlement.objects.create(pk=identity, **expected['fields'])
    return True, newly_verified


@guarded
@transaction.atomic
def automatic_batch(*, after='', limit=3, max_seconds=2,
                    max_source_rows=None, max_actor_rows=None):
    """Process one resumable page with the same local gate as combat and sync."""
    if is_protected():
        raise ValueError('回填保护期间暂停自动战斗统计')
    if (not 1 <= limit <= 50 or max_source_rows is not None and not 1 <= max_source_rows <= 50000
            or max_actor_rows is not None and not 1 <= max_actor_rows <= MAX_ACTOR_ROWS or not 1 <= max_seconds <= 60):
        raise ValueError('旧单人回填批次或来源行数上限无效')
    covered = CombatSoloSettlement.objects.filter(pk=OuterRef('pk'))
    query = legacy_runs().filter(pk__gt=after).alias(has_summary=Exists(covered)).filter(
        has_summary=False).order_by('pk')
    candidates = list(query.values_list('pk', 'owner_id')[:limit])
    started = time.monotonic()
    processed, created, failures, verified = 0, 0, [], set()
    cursor = after
    for identity, owner in candidates:
        if processed and time.monotonic() - started >= max_seconds:
            break
        try:
            with transaction.atomic():
                wrote, newly_verified = _backfill(owner, identity, max_source_rows, max_actor_rows, verified)
            verified.update(newly_verified)
            created += int(wrote)
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError) as exc:
            failures.append({'exploration_id': identity, 'owner_id': owner, 'reason': str(exc)})
        processed += 1
        cursor = identity
    has_more = query.filter(pk__gt=cursor).exists() if processed else bool(candidates)
    return {'processed': processed, 'created': created, 'failures': failures,
            'next_after': cursor, 'has_more': has_more}
