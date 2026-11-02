"""Read personal shared kill receipts; keep frozen solo encounters as the legacy source."""
from dataclasses import dataclass
from django.db import connection
from django.db.models import Exists, OuterRef
from django.db.models.fields.json import KeyTextTransform
from ..combat.models import CombatFact, CombatEncounter, Exploration
from ..combat.party_models import AdventureEvent


@dataclass(frozen=True)
class CombatKill:
    actor_id: str
    exploration_id: str
    identity: str
    monster: dict
    count: int = 1
    sort_key: tuple = ()


def load_combat_kills(owner, *, exploration_ids=None, actor_ids=None, start=None, end=None, include_daily=False):
    if exploration_ids is not None:
        exploration_ids = tuple(exploration_ids)
    if actor_ids is not None:
        actor_ids = tuple(actor_ids)
    runs = Exploration.objects.filter(owner_id=owner)
    if exploration_ids is not None:
        runs = runs.filter(pk__in=exploration_ids)
    if actor_ids is not None:
        runs = runs.filter(actor_id__in=actor_ids)
    covered, daily = set(), []
    if include_daily:
        from .combat_daily import load_daily_kills
        if start is not None and end is not None:
            covered, daily = load_daily_kills(owner, actor_ids=actor_ids, start=start, end=end)
        elif exploration_ids is not None:
            parties = runs.filter(snapshot__has_key='party_id').annotate(
                party_id_text=KeyTextTransform('party_id', 'snapshot')).values_list('party_id_text', flat=True)
            covered, daily = load_daily_kills(owner, party_ids=parties, actor_ids=actor_ids,
                                              exploration_ids=exploration_ids)
    if start is not None and end is not None:
        # First restrict records to the occurrence window, then verify their run
        # and actor in SQL instead of loading every historical exploration ID.
        actors = None
        matching = runs.filter(pk=OuterRef('exploration_id'), actor_id=OuterRef('actor_id'))
        facts = CombatFact.objects.filter(owner_id=owner, kind='round').alias(
            valid_run=Exists(matching.filter(snapshot__has_key='party_id'))).filter(valid_run=True)
        encounters = CombatEncounter.objects.filter(owner_id=owner, result__killed=True).alias(
            valid_run=Exists(matching.exclude(snapshot__has_key='party_id'))).filter(valid_run=True)
        if actor_ids is not None:
            facts = facts.filter(actor_id__in=actor_ids)
            encounters = encounters.filter(actor_id__in=actor_ids)
        # All members' copies of one kill belong to the same shared event time.
        events = AdventureEvent.objects.filter(owner_id=owner, kind='round', created_at__gte=start, created_at__lt=end)
        # PostgreSQL cannot compare a JSONB value directly with a varchar ID subquery.
        facts = facts.alias(shared_event_id_text=KeyTextTransform('shared_event_id', 'payload')).filter(
            shared_event_id_text__in=events.values('pk'))
        if covered:
            summarized_events = AdventureEvent.objects.filter(owner_id=owner, party_id__in=covered).values('pk')
            facts = facts.exclude(shared_event_id_text__in=summarized_events)
        encounters = encounters.filter(ended_at__gte=start, ended_at__lt=end)
    else:
        # Cohort calls have already selected their exploration IDs; retain that
        # bounded lookup and the historical fallback behavior.
        actors = dict(runs.values_list('pk', 'actor_id'))
        party_ids = runs.filter(snapshot__has_key='party_id').values_list('pk', flat=True)
        facts = CombatFact.objects.filter(owner_id=owner, kind='round', exploration_id__in=party_ids)
        encounters = CombatEncounter.objects.filter(owner_id=owner, exploration_id__in=actors,
            result__killed=True).exclude(exploration_id__in=party_ids)
        if covered:
            summarized_runs = runs.alias(party_id_text=KeyTextTransform('party_id', 'snapshot')).filter(
                party_id_text__in=covered).values('pk')
            facts = facts.exclude(exploration_id__in=summarized_runs)
    # Most rounds have no kill receipt. PostgreSQL can reject those in the
    # database, avoiding transfer and Python decoding of their JSON payloads.
    # Keep the Python predicate below as the authoritative validation.
    if connection.vendor == 'postgresql':
        facts = facts.filter(payload__contains={'events': [{'kind': 'kill'}]})
    seen = set()
    pending = list(daily) if covered else None
    for fact in facts.only('actor_id', 'exploration_id', 'sequence', 'payload').order_by('actor_id', 'sequence', 'pk').iterator():
        if (actors is not None and actors.get(fact.exploration_id) != fact.actor_id) or not fact.payload.get('shared_event_id'):
            continue
        for index, event in enumerate(fact.payload.get('events', [])):
            monster = event.get('monster') or {}
            unit = monster.get('unit_id')
            if event.get('kind') != 'kill' or not isinstance(unit, str) or not unit:
                continue
            identity = 'party:' + unit
            key = (fact.actor_id, fact.exploration_id, identity)
            if key not in seen:
                seen.add(key)
                kill = CombatKill(fact.actor_id, fact.exploration_id, identity, monster, 1,
                                  (0, fact.actor_id, fact.sequence, fact.pk, index))
                if pending is None:
                    yield kill
                else:
                    pending.append(kill)
    for encounter in encounters.only('id', 'actor_id', 'exploration_id', 'monster').order_by('pk').iterator():
        if actors is None or actors.get(encounter.exploration_id) == encounter.actor_id:
            kill = CombatKill(encounter.actor_id, encounter.exploration_id,
                'solo:' + encounter.pk, encounter.monster or {}, 1, (1, encounter.pk))
            if pending is None:
                yield kill
            else:
                pending.append(kill)
    if pending is not None:
        yield from sorted(pending, key=lambda row: row.sort_key)
