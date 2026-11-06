"""Atomically replace verified old combat rounds with compact settlements."""
import json
from datetime import timedelta

from django.apps import apps
from django.core import serializers
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.db.models.fields.json import KeyTextTransform
from django.utils import timezone

from system_settings.models import SyncEntityState
from system_settings.sync_state import suspend_tracking
from utils.sync_datetime import SyncJSONEncoder
from utils.sync_models import SnapshotModels
from ..farm_gate import guarded
from .analytics_models import CombatPartySettlement, CombatSoloSettlement
from .migration_guard import is_protected
from .models import CombatFact, CombatIntegrity, Exploration
from .party_daily import FACT, RUN
from .party_daily_sync import SETTLEMENT as PARTY_SETTLEMENT
from .party_models import AdventureEvent, AdventureMember, AdventureParty
from .party_sync import EVENT
from .retention_compaction import CHAIN, compact
from .retention_gate import inspect_statistics_backlog
from .solo_daily_backfill import legacy_runs
from .solo_settlement import SETTLEMENT as SOLO_SETTLEMENT
from .store import digest
from .sync import metadata, validate_source

RETENTION_DAYS = 7
DEFAULT_BATCH_SIZE = 20
# Inputs used by combat.sync and its reservation, stock and asset checks.
# Keep this list synchronized with those validators as they gain new sources.
SOURCE_MODELS = frozenset('''agent combatcatalog combatconfig combatprofile combatfact combatintegrity
    combatencounter equipmentinstance exploration adventureparty adventuremember adventurewave adventureevent
    combatpartycoverage combatpartyday combatpartysettlement combatsolosettlement adventureplanningday
    adventurereservation lifeitem agentrunrecord agentinventoryitem marketlisting markettransaction
    alchemyoperation blacksmithoperation tournamentreward worldaction'''.split())


def _candidates(cutoff, limit):
    available = CombatPartySettlement.objects.exclude(content__has_key='archive').values('pk')
    members = AdventureMember.objects.filter(party_id=OuterRef('pk'))
    late_members = members.filter(Q(active=True) | Q(left_at__isnull=True) | Q(left_at__gt=cutoff))
    late_runs = (Exploration.objects.alias(retention_party_id=KeyTextTransform('party_id', 'snapshot'))
                 .filter(retention_party_id=OuterRef('pk'))
                 .filter(Q(ended_at__isnull=True) | Q(ended_at__gt=cutoff)))
    parties = list(AdventureParty.objects.filter(status='completed', pk__in=available)
                   .alias(has_members=Exists(members), late_members=Exists(late_members),
                          late_runs=Exists(late_runs))
                   .filter(has_members=True, late_members=False, late_runs=False)
                   .order_by('pk').values_list('pk', flat=True)[:limit])
    remaining = max(0, limit - len(parties))
    solo_markers = CombatSoloSettlement.objects.exclude(content__has_key='archive').values('pk')
    solos = list(legacy_runs().filter(pk__in=solo_markers, ended_at__isnull=False, ended_at__lte=cutoff)
                 .order_by('pk').values_list('pk', flat=True)[:remaining])
    return parties, solos


def _snapshot():
    """Read synchronized business records without snapshot-export side effects."""
    data = []
    policy = SnapshotModels(())
    for model in apps.get_app_config('system_settings').get_models():
        if model._meta.model_name not in SOURCE_MODELS:
            continue
        data.extend(json.loads(serializers.serialize('json', policy.queryset_for_export(model), cls=SyncJSONEncoder)))
    return data


def _delete_rows(model, ids):
    ordered = sorted(ids)
    for start in range(0, len(ordered), 5000):
        chunk = ordered[start:start + 5000]
        with suspend_tracking():
            deleted, _ = model.objects.filter(pk__in=chunk, kind='round').delete()
        if deleted != len(chunk):
            raise ValueError('待清理回合在校验后发生变化，已取消整批清理')
        SyncEntityState.objects.filter(model_label=model._meta.label_lower, object_pk__in=chunk).delete()


@guarded
@transaction.atomic
def cleanup_batch(*, now=None, limit=DEFAULT_BATCH_SIZE):
    """Clean covered battles after both full snapshots pass validation.

    The local business/sync gate and one transaction cover the global check,
    full-source validation, projected restore validation, and deletion. Isolated
    historical solo gaps are retained verbatim and never enter this batch.
    Any failure rolls back marker updates, deletions and revision changes.
    """
    if is_protected():
        raise ValueError('回填保护期间暂停战斗回合清理')
    if type(limit) is not int or not 1 <= limit <= 100:
        raise ValueError('战斗回合清理批量无效')
    cutoff = (now or timezone.now()) - timedelta(days=RETENTION_DAYS)
    parties, solos = _candidates(cutoff, limit)
    if not parties and not solos:
        return {'cleaned': 0, 'round_facts': 0, 'round_events': 0, 'has_more': False, 'blocked': False}
    backlog = inspect_statistics_backlog()
    if not backlog['cleanup_coverage_complete']:
        return {'cleaned': 0, 'round_facts': 0, 'round_events': 0, 'has_more': False,
                'blocked': True, 'backlog': backlog}

    # Lock marker rows for this page. Combat writers and snapshot operations
    # share farm_gate, so the snapshot and its derived removals stay coherent.
    list(CombatPartySettlement.objects.select_for_update().filter(pk__in=parties).order_by('pk'))
    list(CombatSoloSettlement.objects.select_for_update().filter(pk__in=solos).order_by('pk'))
    source = _snapshot()
    validate_source(source, metadata(source))
    # Snapshot JSON uses millisecond datetimes. Preserve the database's exact
    # event timestamps in JSON strings before deleting the original rows.
    exact_times = {identity: value.isoformat() for identity, value in AdventureEvent.objects.filter(
        party_id__in=parties, kind='round').values_list('pk', 'created_at')}
    projected, removed, replacements = compact(source, parties, solos, exact_event_times=exact_times)
    validate_source(projected, metadata(projected))
    for (label, identity), row in replacements.items():
        if label not in (PARTY_SETTLEMENT, SOLO_SETTLEMENT):
            continue
        model = CombatPartySettlement if label == PARTY_SETTLEMENT else CombatSoloSettlement
        marker = model.objects.get(pk=identity)
        marker.content, marker.digest = row['fields']['content'], digest(row['fields']['content'])
        marker.save(update_fields=['content', 'digest'])
    for (label, identity), row in replacements.items():
        if label == RUN:
            run = Exploration.objects.get(pk=identity)
            run.snapshot = row['fields']['snapshot']
            run.save(update_fields=['snapshot'])
        elif label == CHAIN:
            chain = CombatIntegrity.objects.get(pk=identity)
            chain.frame = row['fields']['frame']
            chain.save(update_fields=['frame'])
    _delete_rows(CombatFact, removed[FACT])
    _delete_rows(AdventureEvent, removed[EVENT])
    more_parties, more_solos = _candidates(cutoff, 1)
    return {'cleaned': len(parties) + len(solos), 'round_facts': len(removed[FACT]),
            'round_events': len(removed[EVENT]), 'has_more': bool(more_parties or more_solos), 'blocked': False}
