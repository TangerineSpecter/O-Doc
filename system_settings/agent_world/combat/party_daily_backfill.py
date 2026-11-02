"""Materialize one validated shared-session contribution, without deleting sources."""
import json
import time
from contextlib import closing

from django.core import serializers
from django.db import transaction
from django.db.models import Exists, OuterRef

from utils.sync_datetime import SyncJSONEncoder
from ..farm_gate import guarded
from .analytics_models import CombatPartyCoverage, CombatPartyDay
from .facts import frame_digest
from .history_snapshot import verify_chain
from .migration_guard import is_protected
from .models import CombatEncounter, CombatFact, CombatIntegrity, EquipmentInstance, Exploration
from .party_daily_preview import preview
from .party_daily_sync import DAY, records
from .party_models import AdventureMember, AdventureParty

DEFAULT_ACTOR_ROWS = 500000
MAX_ACTOR_ROWS = 2000000


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


def _backfill(owner, identity, max_source_rows, max_actor_rows, verified):
    """Run under the gate and transaction; verified chains stay locked until commit."""
    party = AdventureParty.objects.select_for_update().filter(pk=identity, owner_id=owner).first()
    if party is None:
        raise ValueError('未找到该账号的共同冒险')
    actor_ids = set(AdventureMember.objects.filter(party_id=identity).values_list('actor_id', flat=True))
    if not actor_ids:
        raise ValueError('会话缺少成员来源')
    chains = {row.pk: row for row in CombatIntegrity.objects.select_for_update().filter(pk__in=actor_ids).order_by('pk')}
    if set(chains) != actor_ids:
        raise ValueError('会话成员缺少个人完整性链')
    unchecked = {actor for actor in actor_ids if (owner, actor) not in verified}
    count = sum(query.order_by().count() for query in (
        CombatFact.objects.filter(actor_id__in=unchecked),
        Exploration.objects.filter(actor_id__in=unchecked),
        CombatEncounter.objects.filter(actor_id__in=unchecked),
        EquipmentInstance.objects.filter(actor_id__in=unchecked),
    )) if unchecked else 0
    if count > max_actor_rows:
        raise ValueError(f'未核验个人链及状态共 {count} 行，超过本次回填上限 {max_actor_rows}；未写入摘要')
    fact_fields = ('id', 'actor_id', 'owner_id', 'sequence', 'kind', 'exploration_id',
                   'elapsed_seconds', 'payload', 'previous_hash', 'digest')
    for actor in sorted(unchecked):
        chain = chains[actor]
        chain_data = {key: getattr(chain, key) for key in (
            'owner_id', 'head', 'digest', 'frame', 'archive_sequence', 'archive_digest')}
        ordered = CombatFact.objects.filter(actor_id=actor).order_by('sequence').values(*fact_fields).iterator(chunk_size=500)
        # Close the server-side cursor before a failed savepoint is rolled back.
        with closing(ordered):
            verify_chain(ordered, chain_data, actor, owner)
        if frame_digest(actor) != chain.frame:
            raise ValueError('个人战斗状态与事实链指纹不一致')

    projection = preview(owner, identity, max_source_rows=max_source_rows)
    expected = records(projection)
    existing_models = [*CombatPartyCoverage.objects.filter(pk=identity),
                       *CombatPartyDay.objects.filter(party_id=identity)]
    existing = json.loads(serializers.serialize('json', existing_models, cls=SyncJSONEncoder))
    existing = {(row['model'], str(row['pk'])): row for row in existing}
    expected_map = {(row['model'], str(row['pk'])): row for row in expected}
    if existing:
        if existing != expected_map:
            raise ValueError('该会话已有不同的统计来源，保留原数据并暂停自动覆盖')
        return ({'created': False, 'party_id': identity, 'days': len(projection['days']), 'cleanup_ready': False},
                {(owner, actor) for actor in unchecked})
    coverage = expected[0]
    CombatPartyCoverage.objects.create(pk=identity, **coverage['fields'])
    for row in expected[1:]:
        if row['model'] == DAY:
            CombatPartyDay.objects.create(pk=row['pk'], **row['fields'])
    return ({'created': True, 'party_id': identity, 'days': len(projection['days']), 'cleanup_ready': False},
            {(owner, actor) for actor in unchecked})


@guarded
@transaction.atomic
def backfill_batch(owner=None, *, after='', limit=5, max_source_rows=20000,
                   max_actor_rows=DEFAULT_ACTOR_ROWS, max_seconds=10):
    """Process a bounded, resumable page; failures do not block other parties."""
    if not is_protected():
        raise ValueError('请先在本进程启用 ODOC_COMBAT_BACKFILL_PROTECT=1，并按迁移方案隔离其他设备')
    if (not 1 <= limit <= 50 or not 1 <= max_source_rows <= 50000 or
            not 1 <= max_actor_rows <= MAX_ACTOR_ROWS or not 1 <= max_seconds <= 60):
        raise ValueError('回填批次大小、来源行数或时间上限无效')
    covered = CombatPartyCoverage.objects.filter(pk=OuterRef('pk'))
    query = AdventureParty.objects.filter(status='completed', pk__gt=after).alias(
        has_coverage=Exists(covered)).filter(has_coverage=False).order_by('pk')
    if owner:
        query = query.filter(owner_id=owner)
    candidates = list(query.values_list('pk', 'owner_id')[:limit])
    started = time.monotonic()
    processed, created, failures, verified = 0, 0, [], set()
    cursor = after
    from utils.sync_policy import SyncError
    for identity, account in candidates:
        if processed and time.monotonic()-started >= max_seconds:
            break
        try:
            # Keep successful actor locks through the outer transaction. Failed
            # savepoints do not contribute cached proofs, as their locks roll back.
            with transaction.atomic():
                result, newly_verified = _backfill(account, identity, max_source_rows, max_actor_rows, verified)
            verified.update(newly_verified)
            created += int(result['created'])
        except (ValueError, KeyError, TypeError, AttributeError, SyncError) as exc:
            failures.append({'party_id': identity, 'owner_id': account, 'reason': str(exc)})
        processed += 1
        cursor = identity
    has_more = query.filter(pk__gt=cursor).exists() if processed else bool(candidates)
    return {'processed': processed, 'created': created, 'failures': failures,
            'next_after': cursor, 'has_more': has_more, 'cleanup_ready': False}
