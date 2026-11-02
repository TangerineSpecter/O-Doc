"""Read verified daily party contributions while raw combat sources remain intact."""
from collections import defaultdict
from dataclasses import dataclass
from datetime import time

from ..combat.analytics_models import CombatPartyCoverage, CombatPartyDay
from ..combat.party_models import AdventureParty
from ..combat.store import digest
from ..life_time import local_time


@dataclass(frozen=True)
class DailyKill:
    actor_id: str
    exploration_id: str
    identity: str
    monster: dict
    count: int
    sort_key: tuple


def _valid_groups(days):
    for day in days:
        if not isinstance(day['groups'], list):
            return False
        groups_seen = set()
        for group in day['groups']:
            if (not isinstance(group, dict) or not isinstance(group.get('monster'), dict)
                    or type(group.get('kills')) is not int or group['kills'] <= 0
                    or not isinstance(group.get('participants'), list) or not group['participants']):
                return False
            monster = group['monster']
            if (any(not isinstance(monster.get(key), str) or not monster[key] for key in ('id', 'name', 'rank'))
                    or type(monster.get('level')) is not int or monster['level'] < 0):
                return False
            seen = set()
            identities = []
            for participant in group['participants']:
                if not isinstance(participant, dict):
                    return False
                actor, run = participant.get('actor_id'), participant.get('exploration_id')
                if not isinstance(actor, str) or not actor or not isinstance(run, str) or not run or actor in seen:
                    return False
                if (type(participant.get('first_sequence')) is not int or participant['first_sequence'] <= 0
                        or not isinstance(participant.get('first_fact_id'), str) or not participant['first_fact_id']
                        or type(participant.get('first_event_index')) is not int or participant['first_event_index'] < 0):
                    return False
                seen.add(actor)
                identities.append((actor, run))
            key = (monster['id'], monster['name'], monster['rank'], monster['level'], tuple(sorted(identities)))
            if key in groups_seen:
                return False
            groups_seen.add(key)
    return True


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
        source = marker.source if isinstance(marker.source, dict) else {}
        party = parties.get(marker.pk)
        rows = days_by_party[marker.pk]
        daily = [{'date': row.day.isoformat(), 'first_sequence': row.first_sequence,
                  'last_sequence': row.last_sequence, 'groups': row.groups} for row in rows]
        if (marker.version != 1 or not party or party.status != 'completed'
                or source.get('owner_id') != owner or source.get('party_id') != marker.pk
                or source.get('head') != party.head or source.get('digest') != party.digest
                or source.get('frame') != party.frame or source.get('frame_version') != party.frame_version
                or any(row.owner_id != owner for row in rows)
                or marker.days != [row['date'] for row in daily]
                or source.get('days_digest') != digest(daily) or not _valid_groups(daily)):
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
