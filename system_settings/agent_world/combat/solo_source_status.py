"""Derive solo source gaps without inventing departures or deleting evidence."""
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.db.models.fields.json import KeyTextTransform

from .explorations import TERMINAL
from .models import CombatEncounter, CombatFact, CombatIntegrity, Exploration


def solo_runs() -> QuerySet:
    """Keep uncertain histories, but exclude provably unstarted cancellations."""
    facts = CombatFact.objects.filter(exploration_id=OuterRef('pk'), actor_id=OuterRef('actor_id'),
                                      owner_id=OuterRef('owner_id'))
    encounters = CombatEncounter.objects.filter(exploration_id=OuterRef('pk'), actor_id=OuterRef('actor_id'),
                                                owner_id=OuterRef('owner_id'))
    archived = (CombatIntegrity.objects.filter(pk=OuterRef('actor_id'), owner_id=OuterRef('owner_id'),
                                              archive_sequence__gt=0).exclude(archive_digest=''))
    runs = (Exploration.objects.filter(status__in=TERMINAL).exclude(snapshot__has_key='party_id')
            .alias(solo_departed=Exists(facts.filter(kind='depart')),
                   solo_rounds=Exists(facts.filter(kind='round')),
                   solo_encounters=Exists(encounters),
                   solo_legacy_boundary=Exists(archived),
                   solo_requested=Exists(facts.filter(kind='request')),
                   solo_terminated=Exists(facts.alias(terminal_status=KeyTextTransform('status', 'payload'))
                                          .filter(kind='terminal', terminal_status=OuterRef('status')))))
    no_outcomes = Q()
    for field, empty in (('energy', 0), ('kills', 0), ('experience', 0), ('rewards', []),
                         ('potions_used', {}), ('elixirs_used', {}), ('growth', [])):
        no_outcomes &= ~Q(**{'result__has_key': field}) | Q(**{f'result__{field}': empty})
    # The retired prefix archive also removed request/terminal facts. Its
    # retained baseline is checked by full-source validation before cleanup.
    # Preserve the existing exclusion of failed preparations with no execution.
    cancellation_source = (Q(status='failed') | Q(solo_legacy_boundary=True)
                           | Q(solo_requested=True, solo_terminated=True))
    unstarted = (Q(status__in=('failed', 'interrupted', 'recalled'), ended_at__isnull=False,
                   elapsed_seconds=0, state={},
                   solo_departed=False, solo_rounds=False, solo_encounters=False)
                 & ~Q(snapshot__has_key='plan') & no_outcomes & cancellation_source)
    return runs.exclude(unstarted)


def historical_gap_runs() -> QuerySet:
    """Only missing departures with evidence of execution can be isolated.

    These runs remain untouched and never become cleanup candidates. Duplicate
    departures, ambiguous empty histories, missing end times and invalid saved
    summaries retain their blocking behavior. Full chain/asset validation still
    applies to the entire source snapshot before any other run is cleaned.
    """
    execution = (Q(solo_rounds=True) | Q(solo_encounters=True) | Q(elapsed_seconds__gt=0)
                 | Q(snapshot__has_key='plan') | Q(state__has_key='player')
                 | Q(result__energy__gt=0) | Q(result__kills__gt=0) | Q(result__experience__gt=0))
    return solo_runs().filter(solo_departed=False, ended_at__isnull=False).filter(execution)
