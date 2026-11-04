"""Read verified daily party contributions while raw combat sources remain intact."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import time

from django.db.models import Count, Exists, OuterRef, Q

from ..combat.analytics_models import CombatPartyCoverage, CombatPartyDay
from ..combat.party_daily_coverage import valid_days
from ..combat.party_models import AdventureParty
from ..life_time import local_time


@dataclass(frozen=True)
class DailyKill:
    actor_id: str
    exploration_id: str
    identity: str
    monster: dict
    count: int
    sort_key: tuple


def pending_daily_parties(owner):
    """Count completed parties without a contribution, scoped to this owner."""
    coverage = CombatPartyCoverage.objects.filter(pk=OuterRef('pk'), owner_id=owner)
    parties = AdventureParty.objects.filter(owner_id=owner, status='completed').alias(has_coverage=Exists(coverage))
    counts = parties.aggregate(total=Count('pk'), pending=Count('pk', filter=Q(has_coverage=False)))
    return counts['total'], counts['pending']


def load_daily_kills(owner, *, party_ids=None, actor_ids=None, exploration_ids=None, start=None, end=None):
    """Return covered parties and their compacted kills from one DB snapshot.

    If a coverage marker, party fingerprint or any day is inconsistent, the
    affected party is omitted; callers then read its original facts instead.
    """
    first = last = None
    if start is not None and end is not None:
        first_at, last_at = local_time(start), local_time(end)
        if first_at.time() != time.min or last_at.time() != time.min or first_at >= last_at:
            return set(), []
        first, last = first_at.date(), last_at.date()
        candidates = CombatPartyDay.objects.filter(owner_id=owner, day__gte=first, day__lt=last).values('party_id')
        coverage = CombatPartyCoverage.objects.filter(owner_id=owner, pk__in=candidates)
    elif party_ids is not None:
        coverage = CombatPartyCoverage.objects.filter(owner_id=owner, pk__in=party_ids)
    else:
        return set(), []

    markers = list(coverage)
    identities = [row.pk for row in markers]
    parties = {row.pk: row for row in AdventureParty.objects.filter(pk__in=identities, owner_id=owner).only(
        'id', 'status', 'head', 'digest', 'frame', 'frame_version')}
    days_by_party = defaultdict(list)
    for row in CombatPartyDay.objects.filter(party_id__in=identities).order_by('party_id', 'day'):
        days_by_party[row.party_id].append(row)
    covered, kills = set(), []
    actors = set(actor_ids) if actor_ids is not None else None
    runs = set(exploration_ids) if exploration_ids is not None else None
    for marker in markers:
        party = parties.get(marker.pk)
        rows = days_by_party[marker.pk]
        daily = valid_days(marker, party, rows, owner)
        if daily is None:
            continue
        covered.add(marker.pk)
        for row in daily:
            date = row['date']
            if first is not None and not first.isoformat() <= date < last.isoformat():
                continue
            for index, group in enumerate(row['groups']):
                identity = f'daily:{marker.pk}:{date}:{index}'
                for participant in group['participants']:
                    actor, run = participant['actor_id'], participant['exploration_id']
                    if (actors is None or actor in actors) and (runs is None or run in runs):
                        order = (0, actor, participant['first_sequence'], participant['first_fact_id'],
                                 participant['first_event_index'])
                        kills.append(DailyKill(actor, run, identity, group['monster'], group['kills'], order))
    return covered, kills
