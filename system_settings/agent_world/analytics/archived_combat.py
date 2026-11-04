"""Read individual archived kills when daily groups cannot answer a window."""
from utils.sync_policy import SyncError
from django.db.models import Q
from django.db.models.fields.json import KeyTextTransform, KeyTransform
from ..combat.analytics_models import CombatPartySettlement
from ..combat.party_daily import _timestamp
from ..combat.party_models import AdventureParty
from ..combat.retention_projection import validate_archive
from ..combat.store import digest
from ..life_time import local_time
from .combat_kills import CombatKill


class InvalidCombatStatisticsSource(ValueError):
    """An archived source cannot safely provide complete statistics."""


def archived_markers(owner, *, party_ids=None, start=None, end=None):
    """Limit archived sessions by the same broad local-day bounds as the reader."""
    first = local_time(start) if start is not None else None
    last = local_time(end) if end is not None else None
    markers = CombatPartySettlement.objects.filter(owner_id=owner, content__has_key='archive')
    if party_ids is not None:
        markers = markers.filter(pk__in=party_ids)
    if first is not None and last is not None:
        bounds = KeyTransform('day_bounds', 'content')
        markers = (markers.alias(first_day=KeyTextTransform('date', KeyTransform('0', bounds)),
                                 last_day=KeyTextTransform('date', KeyTransform('-1', bounds)))
                   .filter(Q(first_day__isnull=True) | Q(last_day__isnull=True)
                           | Q(first_day__lte=last.date().isoformat(), last_day__gte=first.date().isoformat())))
    return markers


def load_archived_kills(owner, party_ids, *, actors, runs, start=None, end=None, include_monster=True):
    if not party_ids:
        return set(), []
    first = local_time(start) if start is not None else None
    last = local_time(end) if end is not None else None
    markers = list(archived_markers(owner, party_ids=party_ids, start=start, end=end))
    parties = AdventureParty.objects.filter(owner_id=owner, pk__in=[row.pk for row in markers]).in_bulk()
    allowed_actors = set(actors) if actors is not None else None
    covered, kills = set(), []
    for marker in markers:
        try:
            content = marker.content
            archive = validate_archive(content)
            party = parties.get(marker.pk)
            origin = content['origin']
            if (marker.version != 1 or marker.digest != digest(content) or content['party_id'] != marker.pk
                    or content['owner_id'] != owner or not party or party.status != 'completed'
                    or any(origin[key] != getattr(party, key) for key in ('head', 'digest', 'frame', 'frame_version'))):
                raise ValueError('压缩结算与会话来源不一致')
            covered.add(marker.pk)
            for item in content['kills']:
                at = _timestamp(archive['exact_event_times'][item['shared_event_id']])
                if (first is not None and at < first) or (last is not None and at >= last):
                    continue
                for person in item['participants']:
                    actor, run = person['actor_id'], person['exploration_id']
                    if runs.get(run) != actor or allowed_actors is not None and actor not in allowed_actors:
                        continue
                    order = (0, actor, person['first_sequence'], person['first_fact_id'], person['first_event_index'])
                    monster = {**item['monster'], 'unit_id': item['unit_id']} if include_monster else {}
                    kills.append(CombatKill(actor, run, 'party:' + item['unit_id'], monster, 1, order))
        except (ValueError, KeyError, TypeError, AttributeError, IndexError, SyncError) as exc:
            raise InvalidCombatStatisticsSource('已清理战斗的结算不完整，无法计算击杀统计') from exc
    return covered, kills
