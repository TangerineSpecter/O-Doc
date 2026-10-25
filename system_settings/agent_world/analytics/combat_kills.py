"""Read personal shared kill receipts; keep frozen solo encounters as the legacy source."""
from dataclasses import dataclass
from django.db.models.fields.json import KeyTextTransform
from ..combat.models import CombatFact, CombatEncounter, Exploration
from ..combat.party_models import AdventureEvent


@dataclass(frozen=True)
class CombatKill:
    actor_id: str
    exploration_id: str
    identity: str
    monster: dict


def load_combat_kills(owner, *, exploration_ids=None, actor_ids=None, start=None, end=None):
    runs = Exploration.objects.filter(owner_id=owner)
    if exploration_ids is not None:
        runs = runs.filter(pk__in=exploration_ids)
    if actor_ids is not None:
        runs = runs.filter(actor_id__in=actor_ids)
    actors = dict(runs.values_list('pk', 'actor_id'))
    party_ids = runs.filter(snapshot__has_key='party_id').values_list('pk', flat=True)
    facts = CombatFact.objects.filter(owner_id=owner, kind='round', exploration_id__in=party_ids)
    encounters = CombatEncounter.objects.filter(owner_id=owner, exploration_id__in=actors,
        result__killed=True).exclude(exploration_id__in=party_ids)
    if start is not None and end is not None:
        # All members' copies of one kill belong to the same shared event time.
        events = AdventureEvent.objects.filter(owner_id=owner, kind='round', created_at__gte=start, created_at__lt=end)
        # PostgreSQL cannot compare a JSONB value directly with a varchar ID subquery.
        facts = facts.alias(shared_event_id_text=KeyTextTransform('shared_event_id', 'payload')).filter(
            shared_event_id_text__in=events.values('pk'))
        encounters = encounters.filter(ended_at__gte=start, ended_at__lt=end)
    seen = set()
    for fact in facts.order_by('actor_id', 'sequence', 'pk').iterator():
        if actors.get(fact.exploration_id) != fact.actor_id or not fact.payload.get('shared_event_id'):
            continue
        for event in fact.payload.get('events', []):
            monster = event.get('monster') or {}
            unit = monster.get('unit_id')
            if event.get('kind') != 'kill' or not isinstance(unit, str) or not unit:
                continue
            identity = 'party:' + unit
            key = (fact.actor_id, fact.exploration_id, identity)
            if key not in seen:
                seen.add(key)
                yield CombatKill(fact.actor_id, fact.exploration_id, identity, monster)
    for encounter in encounters.order_by('pk').iterator():
        if actors.get(encounter.exploration_id) == encounter.actor_id:
            yield CombatKill(encounter.actor_id, encounter.exploration_id,
                'solo:' + encounter.pk, encounter.monster or {})
