"""Preliminary global statistics coverage check before combat retention."""

from collections import defaultdict

from django.db import transaction
from django.db.models import Exists, OuterRef
from django.db.models.fields.json import KeyTextTransform

from utils.sync_policy import SyncError
from ..farm_gate import guarded
from .analytics_eligibility import finished_explorations
from .analytics_models import CombatPartyCoverage, CombatPartyDay, CombatPartySettlement, CombatSoloSettlement
from .explorations import TERMINAL
from .models import CombatEncounter, CombatFact, Exploration
from .party_daily_coverage import valid_days
from .party_models import AdventureEvent, AdventureParty
from .party_settlement_archive import validate_settlement
from .solo_daily_backfill import legacy_runs
from .solo_source_status import historical_gap_runs
from .solo_settlement import matches_run as solo_matches_run
from .store import digest


@guarded
@transaction.atomic
def inspect_statistics_backlog():
    """Check finished sources, exposing isolated gaps separately from blockers.

    This is a preliminary coverage check, not permission to delete: complete
    source chains, assets and the projected recovery snapshot are verified by
    the cleanup transaction after this check.
    Active parties and proven unstarted cancellations are not backlog. A solo
    missing its departure may remain an explicit historical gap; it is never
    summarized or cleaned, while all other source validation remains required.
    """
    parties = {row.pk: row for row in AdventureParty.objects.only(
        'id', 'owner_id', 'status', 'head', 'digest', 'frame', 'frame_version').iterator(chunk_size=128)}
    completed_by_owner = defaultdict(set)
    for party_id, party in parties.items():
        if party.status == 'completed':
            completed_by_owner[party.owner_id].add(party_id)
    markers = {row.pk: row for row in CombatPartyCoverage.objects.iterator(chunk_size=128)}
    settlement_owners = dict(CombatPartySettlement.objects.values_list('pk', 'owner_id').iterator())
    days_by_party = defaultdict(list)
    for row in CombatPartyDay.objects.order_by('party_id', 'day').iterator(chunk_size=128):
        days_by_party[row.party_id].append(row)

    missing, invalid, validated_days = set(), set(), {}
    for owner, party_ids in completed_by_owner.items():
        present = {party for party in party_ids if party in markers and markers[party].owner_id == owner}
        missing.update(party_ids - present)
        covered = set()
        for party in present:
            days = valid_days(markers[party], parties[party], days_by_party[party], owner)
            if days is not None:
                covered.add(party)
                validated_days[party] = days
        finished = set(finished_explorations(Exploration.objects.all(), owner)
            .filter(snapshot__has_key='party_id')
            .annotate(retention_party_id=KeyTextTransform('party_id', 'snapshot'))
            .values_list('retention_party_id', flat=True))
        invalid.update(present - (covered & finished))
    invalid.update(party_id for party_id, marker in markers.items()
                   if party_id not in parties or parties[party_id].owner_id != marker.owner_id
                   or parties[party_id].status != 'completed')

    invalid_days = sum(1 for party_id, rows in days_by_party.items() for row in rows
                       if party_id not in markers or markers[party_id].owner_id != row.owner_id)

    missing_settlements, invalid_settlements = set(), set()
    for owner, party_ids in completed_by_owner.items():
        missing_settlements.update(party for party in party_ids if settlement_owners.get(party) != owner)
    for settlement in CombatPartySettlement.objects.iterator(chunk_size=128):
        party_id = settlement.pk
        party, marker = parties.get(party_id), markers.get(party_id)
        try:
            if (not party or party.status != 'completed' or party.owner_id != settlement.owner_id
                    or not marker or marker.owner_id != settlement.owner_id or settlement.version != 1
                    or settlement.digest != digest(settlement.content)
                    or settlement.content.get('origin') != marker.source):
                raise ValueError('压缩结算与来源覆盖不一致')
            days = validated_days.get(party_id)
            if days is None or validate_settlement(settlement.content) != days:
                raise ValueError('压缩结算无法重建已保存的每日统计')
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError):
            invalid_settlements.add(party_id)

    legacy = {run.pk: run for run in legacy_runs().only(
        'id', 'owner_id', 'actor_id', 'catalog_id', 'status', 'ended_at', 'elapsed_seconds', 'snapshot', 'result'
    ).iterator(chunk_size=128)}
    solo_owners = dict(CombatSoloSettlement.objects.values_list('pk', 'owner_id').iterator())
    missing_solo = {identity for identity, run in legacy.items()
                    if solo_owners.get(identity) != run.owner_id}
    isolated_solo = set(historical_gap_runs().filter(pk__in=missing_solo)
                        .exclude(pk__in=solo_owners).values_list('pk', flat=True))
    invalid_solo = set()
    for settlement in CombatSoloSettlement.objects.iterator(chunk_size=128):
        identity = settlement.pk
        run = legacy.get(identity)
        if not run or not solo_matches_run(settlement, run):
            invalid_solo.add(identity)

    parent = AdventureParty.objects.filter(pk=OuterRef('retention_party_id'), owner_id=OuterRef('owner_id'),
                                           status__in=('active', 'paused', 'completed'))
    orphan_runs = (Exploration.objects.filter(status__in=TERMINAL, snapshot__has_key='party_id')
        .alias(retention_party_id=KeyTextTransform('party_id', 'snapshot'), has_parent=Exists(parent))
        .filter(has_parent=False).count())
    parent_run = Exploration.objects.filter(pk=OuterRef('exploration_id'), actor_id=OuterRef('actor_id'),
                                           owner_id=OuterRef('owner_id'))
    orphan_facts = (CombatFact.objects.filter(kind='round').alias(has_run=Exists(parent_run))
                    .filter(has_run=False).count())
    orphan_encounters = (CombatEncounter.objects.alias(has_run=Exists(parent_run))
                         .filter(has_run=False).count())
    event_party = AdventureParty.objects.filter(pk=OuterRef('party_id'), owner_id=OuterRef('owner_id'))
    orphan_events = (AdventureEvent.objects.filter(kind='round').alias(has_party=Exists(event_party))
                     .filter(has_party=False).count())

    counts = {
        'completed_parties': sum(len(items) for items in completed_by_owner.values()),
        'missing_party_summaries': len(missing),
        'invalid_party_summaries': len(invalid),
        'orphan_daily_rows': invalid_days,
        'missing_settlements': len(missing_settlements),
        'invalid_settlements': len(invalid_settlements),
        'legacy_solo_runs': len(missing_solo),
        'invalid_legacy_solo_summaries': len(invalid_solo),
        'orphan_group_runs': orphan_runs,
        'orphan_round_facts': orphan_facts,
        'orphan_encounters': orphan_encounters,
        'orphan_round_events': orphan_events,
    }
    complete = not any(value for key, value in counts.items() if key != 'completed_parties')
    cleanup_counts = {**counts, 'legacy_solo_runs': len(missing_solo - isolated_solo)}
    return {**counts, 'basic_coverage_complete': complete,
            'historical_solo_gaps': len(isolated_solo),
            'historical_solo_gap_ids': sorted(isolated_solo),
            'blocking_legacy_solo_runs': len(missing_solo - isolated_solo),
            'cleanup_coverage_complete': not any(value for key, value in cleanup_counts.items()
                                                if key != 'completed_parties'),
            'cleanup_ready': False,
            'scope': '全账号已结束战斗的初步覆盖；缺少出发事实且有执行依据的单人历史保留为缺口，不阻断其他完整场次。清理事务仍须完整校验全部来源链、资产及压缩后的恢复数据。'}
