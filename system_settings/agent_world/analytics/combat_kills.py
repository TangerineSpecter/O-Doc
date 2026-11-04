"""Read personal shared kill receipts; keep frozen solo encounters as the legacy source."""
from dataclasses import dataclass
from django.db import connection
from django.db.models import BooleanField, Case, F, Q, Value, When
from django.db.models.fields.json import KeyTextTransform
from ..combat.models import CombatFact, CombatEncounter, Exploration
from ..combat.party_models import AdventureEvent
from ..combat.analytics_eligibility import finished_explorations
from .combat_receipt_projection import CombatReceiptProjection


@dataclass(frozen=True)
class CombatKill:
    actor_id: str
    exploration_id: str
    identity: str
    monster: dict
    count: int = 1
    sort_key: tuple = ()


def load_combat_kills(owner, *, exploration_ids=None, actor_ids=None, start=None, end=None, include_daily=False,
                      include_monster=True):
    if exploration_ids is not None:
        exploration_ids = tuple(exploration_ids)
    if actor_ids is not None:
        actor_ids = tuple(actor_ids)
    runs = finished_explorations(Exploration.objects.all(), owner)
    if exploration_ids is not None:
        runs = runs.filter(pk__in=exploration_ids)
    if actor_ids is not None:
        runs = runs.filter(actor_id__in=actor_ids)
    by_occurrence = start is not None and end is not None
    if by_occurrence:
        # A run's recorded end is not a safe proxy for the actual shared-event
        # timestamp. Restrict candidates using the retained occurrence sources,
        # including archived parties whose individual events have been removed.
        from ..combat.analytics_models import CombatPartyDay
        from ..life_time import local_time
        from .archived_combat import archived_markers
        events = AdventureEvent.objects.filter(owner_id=owner, kind='round',
            created_at__gte=start, created_at__lt=end).values('party_id')
        first, last = local_time(start).date(), local_time(end).date()
        days = CombatPartyDay.objects.filter(owner_id=owner, day__gte=first, day__lte=last).values('party_id')
        archived = archived_markers(owner, start=start, end=end).values('pk')
        encounters = CombatEncounter.objects.filter(owner_id=owner, result__killed=True,
            ended_at__gte=start, ended_at__lt=end).values('exploration_id')
        runs = runs.filter(Q(pk__in=encounters) | Q(_analytics_party_id__in=events)
                           | Q(_analytics_party_id__in=days) | Q(_analytics_party_id__in=archived))
    # Evaluate completion and party membership once per exploration, rather
    # than repeating that verification for each matching combat receipt.
    run_rows = list(runs.annotate(
        party_id_text=KeyTextTransform('party_id', 'snapshot'),
        is_party=Case(When(snapshot__has_key='party_id', then=Value(True)),
                      default=Value(False), output_field=BooleanField()),
    ).values_list('pk', 'actor_id', 'party_id_text', 'is_party'))
    if not run_rows:
        return
    actors = {run: actor for run, actor, _, _ in run_rows}
    covered, daily, solo_covered, solo_daily = set(), [], set(), []
    if include_daily:
        from .combat_daily import load_daily_kills
        from .solo_daily import load_solo_kills
        solo_ids = [run for run, _, _, is_party in run_rows if not is_party]
        solo_covered, solo_daily = load_solo_kills(
            owner, solo_ids, start=start if by_occurrence else None, end=end if by_occurrence else None,
            include_monster=include_monster)
        if by_occurrence:
            covered, daily = load_daily_kills(owner, actor_ids=actor_ids, exploration_ids=actors,
                                              start=start, end=end)
        elif exploration_ids is not None:
            parties = {party for _, _, party, is_party in run_rows if is_party and party}
            covered, daily = load_daily_kills(owner, party_ids=parties, actor_ids=actor_ids,
                                              exploration_ids=exploration_ids)
    # Archived groups no longer have individual round receipts. Their exact
    # kill outcomes also cover sub-day windows or callers requesting raw data.
    from .archived_combat import load_archived_kills
    archived_parties = {party for _, _, party, is_party in run_rows if is_party and party and party not in covered}
    archived, archived_kills = load_archived_kills(
        owner, archived_parties, actors=actor_ids, runs=actors,
        start=start if by_occurrence else None, end=end if by_occurrence else None,
        include_monster=include_monster)
    covered.update(archived)
    daily.extend(archived_kills)
    if by_occurrence:
        party_runs = [run for run, _, party, is_party in run_rows if is_party and party not in covered]
        solo_runs = [run for run, _, _, is_party in run_rows if not is_party and run not in solo_covered]
        facts = CombatFact.objects.filter(owner_id=owner, kind='round', exploration_id__in=party_runs)
        encounters = CombatEncounter.objects.filter(owner_id=owner, result__killed=True, exploration_id__in=solo_runs)
        if actor_ids is not None:
            facts = facts.filter(actor_id__in=actor_ids)
            encounters = encounters.filter(actor_id__in=actor_ids)
        # All members' copies of one kill belong to the same shared event time.
        events = AdventureEvent.objects.filter(owner_id=owner, kind='round', created_at__gte=start, created_at__lt=end)
        if covered:
            events = events.exclude(party_id__in=covered)
            # A fully covered window has no group receipts to inspect. Avoid
            # querying the much larger personal-round table altogether.
            if not events.exists():
                facts = facts.none()
        # PostgreSQL cannot compare a JSONB value directly with a varchar ID subquery.
        facts = facts.alias(shared_event_id_text=KeyTextTransform('shared_event_id', 'payload')).filter(
            shared_event_id_text__in=events.values('pk'))
        encounters = encounters.filter(ended_at__gte=start, ended_at__lt=end)
    else:
        raw_party_runs = [run for run, _, party, is_party in run_rows if is_party and party not in covered]
        solo_runs = [run for run, _, _, is_party in run_rows if not is_party and run not in solo_covered]
        facts = CombatFact.objects.filter(owner_id=owner, kind='round', exploration_id__in=raw_party_runs)
        encounters = CombatEncounter.objects.filter(owner_id=owner, exploration_id__in=solo_runs,
                                                     result__killed=True)
    # PostgreSQL filters non-kill rounds and projects away rewards and
    # consumption; the Python predicate remains the authoritative validation.
    if connection.vendor == 'postgresql':
        facts = facts.filter(payload__contains={'events': [{'kind': 'kill'}]}).annotate(
            receipt_for_analytics=CombatReceiptProjection(F('payload')))
        receipt_field = 'receipt_for_analytics'
    else:
        receipt_field = 'payload'
    rows = facts.order_by('actor_id', 'sequence', 'pk').values_list(
        'actor_id', 'exploration_id', 'sequence', 'pk', receipt_field).iterator()
    seen = set()
    pending = [*daily, *solo_daily] if covered or solo_covered else None
    for actor_id, exploration_id, sequence, fact_id, receipt in rows:
        if actors.get(exploration_id) != actor_id or not receipt.get('shared_event_id'):
            continue
        for index, event in enumerate(receipt.get('events', [])):
            monster = event.get('monster') or {}
            unit = monster.get('unit_id')
            if event.get('kind') != 'kill' or not isinstance(unit, str) or not unit:
                continue
            identity = 'party:' + unit
            key = (actor_id, exploration_id, identity)
            if key not in seen:
                seen.add(key)
                kill = CombatKill(actor_id, exploration_id, identity, monster if include_monster else {}, 1,
                                  (0, actor_id, sequence, fact_id, index))
                if pending is None:
                    yield kill
                else:
                    pending.append(kill)
    encounter_fields = ('id', 'actor_id', 'exploration_id') + (('monster',) if include_monster else ())
    for encounter in encounters.only(*encounter_fields).order_by('pk').iterator():
        if actors.get(encounter.exploration_id) == encounter.actor_id:
            kill = CombatKill(encounter.actor_id, encounter.exploration_id,
                'solo:' + encounter.pk, (encounter.monster or {}) if include_monster else {}, 1, (1, encounter.pk))
            if pending is None:
                yield kill
            else:
                pending.append(kill)
    if pending is not None:
        yield from sorted(pending, key=lambda row: row.sort_key)
