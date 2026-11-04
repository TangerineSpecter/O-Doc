"""Materialize one validated shared-session contribution, without deleting sources."""
import json
import time

from django.core import serializers
from django.db import transaction
from django.db.models import Exists, OuterRef, Q

from utils.sync_datetime import SyncJSONEncoder
from ..farm_gate import guarded
from .analytics_models import CombatPartyCoverage, CombatPartyDay, CombatPartySettlement
from .migration_guard import is_protected
from .party_daily_preview import preview
from .party_daily_sync import DAY, records, settlement_record
from .party_models import AdventureMember, AdventureParty
from .summary_verification import DEFAULT_ACTOR_ROWS, MAX_ACTOR_ROWS, verify_actors


@guarded
@transaction.atomic
def backfill(owner, identity, *, max_source_rows=20000, max_actor_rows=DEFAULT_ACTOR_ROWS):
    """Idempotently write a single source only while legacy writes are frozen.

    This creates synchronized statistics contributions but never removes raw
    events. Conflicting existing contributions are rejected for manual review.
    """
    if not is_protected():
        raise ValueError('请先在本进程启用 ODOC_COMBAT_BACKFILL_PROTECT=1，并按迁移方案隔离其他设备')
    if not 1 <= max_source_rows <= 50000 or not 1 <= max_actor_rows <= MAX_ACTOR_ROWS:
        raise ValueError('单场或个人来源行数上限无效')
    result, _ = _backfill(owner, identity, max_source_rows, max_actor_rows, set())
    return result


def _backfill(owner, identity, max_source_rows, max_actor_rows, verified, *, include_settlement=False):
    """Run under the gate and transaction; verified chains stay locked until commit."""
    party = AdventureParty.objects.select_for_update().filter(pk=identity, owner_id=owner).first()
    if party is None:
        raise ValueError('未找到该账号的共同冒险')
    actor_ids = set(AdventureMember.objects.filter(party_id=identity).values_list('actor_id', flat=True))
    if not actor_ids:
        raise ValueError('会话缺少成员来源')
    newly_verified = verify_actors(owner, actor_ids, max_actor_rows, verified)

    archived = CombatPartySettlement.objects.filter(pk=identity, owner_id=owner, content__has_key='archive').first()
    if archived:
        # Once rounds are gone, their validated settlement is the source for
        # deterministic reconstruction of missing daily contributions.
        from .archived_daily_rebuild import rebuild_one
        newly_verified.update(rebuild_one(archived, verified=verified | newly_verified))
        return ({'created': True, 'settlement_created': False, 'settlement_error': '',
                 'party_id': identity, 'days': CombatPartyDay.objects.filter(party_id=identity).count(),
                 'cleanup_ready': False}, newly_verified)

    projection = preview(owner, identity, max_source_rows=max_source_rows, include_settlement=include_settlement)
    expected = records(projection)
    existing_models = [*CombatPartyCoverage.objects.filter(pk=identity),
                       *CombatPartyDay.objects.filter(party_id=identity)]
    existing = json.loads(serializers.serialize('json', existing_models, cls=SyncJSONEncoder))
    existing = {(row['model'], str(row['pk'])): row for row in existing}
    expected_map = {(row['model'], str(row['pk'])): row for row in expected}
    created = False
    if existing:
        if existing != expected_map:
            raise ValueError('该会话已有不同的统计来源，保留原数据并暂停自动覆盖')
    else:
        coverage = expected[0]
        CombatPartyCoverage.objects.create(pk=identity, **coverage['fields'])
        for row in expected[1:]:
            if row['model'] == DAY:
                CombatPartyDay.objects.create(pk=row['pk'], **row['fields'])
        created = True
    settled = False
    settlement_error = projection.get('_settlement_error', '') if include_settlement else ''
    if include_settlement and not settlement_error:
        compact = projection['_settlement']
        expected_settlement = settlement_record(compact)
        previous = list(CombatPartySettlement.objects.filter(pk=identity))
        if previous:
            current = json.loads(serializers.serialize('json', previous, cls=SyncJSONEncoder))[0]
            if current != expected_settlement:
                raise ValueError('该会话已有不同的压缩结算，保留原数据并暂停自动覆盖')
        else:
            CombatPartySettlement.objects.create(pk=identity, **expected_settlement['fields'])
            settled = True
    return ({'created': created, 'settlement_created': settled, 'settlement_error': settlement_error,
             'party_id': identity, 'days': len(projection['days']), 'cleanup_ready': False},
            newly_verified)


@guarded
@transaction.atomic
def backfill_batch(owner=None, *, after='', limit=5, max_source_rows=20000,
                   max_actor_rows=DEFAULT_ACTOR_ROWS, max_seconds=10):
    """Process a bounded, resumable page; failures do not block other parties."""
    if not is_protected():
        raise ValueError('请先在本进程启用 ODOC_COMBAT_BACKFILL_PROTECT=1，并按迁移方案隔离其他设备')
    return _backfill_batch(owner, after=after, limit=limit, max_source_rows=max_source_rows,
                           max_actor_rows=max_actor_rows, max_seconds=max_seconds)


def _backfill_batch(owner=None, *, after='', limit=5, max_source_rows=20000,
                    max_actor_rows=DEFAULT_ACTOR_ROWS, max_seconds=10, include_settlement=False):
    """Run under the caller's gate and transaction."""
    if (not 1 <= limit <= 50 or max_source_rows is not None and not 1 <= max_source_rows <= 50000 or
            max_actor_rows is not None and not 1 <= max_actor_rows <= MAX_ACTOR_ROWS or not 1 <= max_seconds <= 60):
        raise ValueError('回填批次大小、来源行数或时间上限无效')
    covered = CombatPartyCoverage.objects.filter(pk=OuterRef('pk'))
    query = AdventureParty.objects.filter(status='completed', pk__gt=after).alias(
        has_coverage=Exists(covered))
    if include_settlement:
        settlements = CombatPartySettlement.objects.filter(pk=OuterRef('pk'))
        query = query.alias(has_settlement=Exists(settlements)).filter(
            Q(has_coverage=False) | Q(has_settlement=False))
    else:
        query = query.filter(has_coverage=False)
    query = query.order_by('pk')
    if owner:
        query = query.filter(owner_id=owner)
    candidates = list(query.values_list('pk', 'owner_id')[:limit])
    started = time.monotonic()
    processed, created, settled, failures, verified = 0, 0, 0, [], set()
    cursor = after
    from utils.sync_policy import SyncError
    for identity, account in candidates:
        if processed and time.monotonic()-started >= max_seconds:
            break
        try:
            # Keep successful actor locks through the outer transaction. Failed
            # savepoints do not contribute cached proofs, as their locks roll back.
            with transaction.atomic():
                result, newly_verified = _backfill(account, identity, max_source_rows, max_actor_rows, verified,
                                                   include_settlement=include_settlement)
            verified.update(newly_verified)
            created += int(result['created'])
            settled += int(result['settlement_created'])
            if result['settlement_error']:
                failures.append({'party_id': identity, 'owner_id': account, 'reason': result['settlement_error']})
        except (ValueError, KeyError, TypeError, AttributeError, SyncError) as exc:
            failures.append({'party_id': identity, 'owner_id': account, 'reason': str(exc)})
        processed += 1
        cursor = identity
    has_more = query.filter(pk__gt=cursor).exists() if processed else bool(candidates)
    return {'processed': processed, 'created': created, 'settlement_created': settled, 'failures': failures,
            'next_after': cursor, 'has_more': has_more, 'cleanup_ready': False}
