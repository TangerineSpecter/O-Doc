"""Tournament progression. Writes are short transactions; simulation happens outside."""
import uuid
from collections import Counter
from datetime import timedelta
from django.db import transaction
from system_settings.models import Agent
from .combat.models import CombatProfile
from .farm_gate import guarded
from .life_time import local_time, storage_time
from .tournament_models import Tournament, TournamentRound, TournamentMatch, TournamentReward, TournamentRuntime
from .tournament_rules import key, draw, at_two, next_sunday


def active_ids(owner: str, actors: list[str]) -> set[str]:
    profiles = CombatProfile.objects.filter(owner_id=owner, pk__in=actors).values_list('pk', flat=True)
    return set(Agent.objects.filter(pk__in=profiles, archived_at__isnull=True).values_list('pk', flat=True))


@guarded
@transaction.atomic
def create_due(owner: str, now=None, check=lambda: None) -> Tournament | None:
    check()
    point = local_time(now)
    runtime, _ = TournamentRuntime.objects.select_for_update().get_or_create(
        pk=key('calendar', owner), defaults={'first_sunday': next_sunday(point.date())})
    if not runtime.first_sunday or point.date() < runtime.first_sunday or point.weekday() != 6 or point.hour < 14:
        return None
    identity = key('tournament', owner, point.date())
    existing = Tournament.objects.filter(pk=identity).first()
    if existing:
        return existing
    actors = active_ids(owner, list(CombatProfile.objects.filter(owner_id=owner).values_list('pk', flat=True)))
    roster = list(Agent.objects.filter(pk__in=actors).order_by('pk').values('id', 'name'))
    event = Tournament.objects.create(pk=identity, owner_id=owner, week=point.date(), roster=roster,
        seed=uuid.uuid4().hex, status='active' if len(roster) >= 2 else 'skipped',
        ended_at=storage_time(point) if len(roster) < 2 else None)
    if len(roster) >= 2:
        preliminary = len(roster) > 64
        make_round(event, [row['id'] for row in roster], at_two(event.week) + timedelta(days=0 if preliminary else 1),
                   'preliminary' if preliminary else 'main')
    return event


def make_round(event: Tournament, entrants: list[str], scheduled_at, phase: str) -> TournamentRound:
    number = event.rounds.count() + 1
    if phase != 'preliminary' and len(entrants) <= 2:
        phase = 'final'
    row = TournamentRound.objects.create(pk=key(event.pk, 'round', number), tournament=event,
        owner_id=event.owner_id, number=number, phase=phase, entrants=entrants,
        scheduled_at=storage_time(scheduled_at))
    byes = Counter(TournamentMatch.objects.filter(round__tournament=event, right_id='', kind='main',
                   status='done', result__reason='bye').values_list('left_id', flat=True))
    pairs = draw(entrants, dict(byes), key(event.seed, number))
    for index, (left, right) in enumerate(pairs, 1):
        TournamentMatch.objects.create(pk=key(row.pk, index), round=row, owner_id=event.owner_id,
                                      number=index, left_id=left, right_id=right)
    if phase == 'final':
        bronze = event.result.get('bronze_candidates', [])
        if len(bronze) == 2:
            index = len(pairs) + 1
            TournamentMatch.objects.create(pk=key(row.pk, index), round=row, owner_id=event.owner_id,
                                          number=index, kind='bronze', left_id=bronze[0], right_id=bronze[1])
    return row


def match_input(match: TournamentMatch) -> tuple[dict, dict]:
    """Read current profiles without healing or modifying their exploration state."""
    inputs, result = read_fighters(match)
    if result:
        return {}, result
    from .tournament_battle import simulate
    report = simulate(*inputs, key(match.round.tournament.seed, match.pk))
    return report, {name: report[name] for name in ('winner_id', 'loser_id', 'reason')}


@guarded
@transaction.atomic
def read_fighters(match: TournamentMatch) -> tuple[list, dict]:
    # Capture a coherent in-memory input in a short transaction. Simulation and
    # storage of the resulting historical report both happen after releasing it.
    actors = active_ids(match.owner_id, [match.left_id, match.right_id])
    if len(actors) < 2:
        winner = next(iter(actors), '')
        return [], {'winner_id': winner, 'loser_id': '',
                    'reason': 'bye' if winner and not match.right_id else 'withdrawal'}
    from .tournament_battle import participant
    profiles = {p.pk: p for p in CombatProfile.objects.filter(pk__in=actors, owner_id=match.owner_id)}
    names = dict(Agent.objects.filter(pk__in=actors).values_list('pk', 'name'))
    return [participant(profiles[match.left_id], names[match.left_id]),
            participant(profiles[match.right_id], names[match.right_id])], {}


@guarded
@transaction.atomic
def commit_match(identity: str, report: dict, result: dict, check=lambda: None, now=None) -> None:
    check()
    match = TournamentMatch.objects.select_for_update().select_related('round__tournament').get(pk=identity)
    if match.status == 'done' or match.round.tournament.status != 'active':
        return
    # Archiving during a computation is a withdrawal, not a stale win.
    actors = active_ids(match.owner_id, [match.left_id, match.right_id])
    if len(actors) < 2:
        report = {}
        result = {'winner_id': next(iter(actors), ''), 'loser_id': '',
                  'reason': 'bye' if actors and not match.right_id else 'withdrawal'}
    match.report, match.result, match.status = report, result, 'done'
    match.played_at = storage_time(local_time(now))
    match.save(update_fields=['report', 'result', 'status', 'played_at'])


def finish_event(event: Tournament, podium: dict[str, str], now) -> None:
    eligible = active_ids(event.owner_id, list(podium.values()))
    podium = {place: actor for place, actor in podium.items() if actor in eligible}
    event.status, event.ended_at = 'completed', storage_time(local_time(now))
    event.result = {**event.result, 'podium': podium}
    event.save(update_fields=['status', 'ended_at', 'result'])
    for place, actor in podium.items():
        TournamentReward.objects.get_or_create(pk=key(event.pk, 'reward', place), defaults={
            'tournament': event, 'owner_id': event.owner_id, 'place': int(place), 'actor_id': actor})


@guarded
@transaction.atomic
def advance(identity: str, now=None, check=lambda: None) -> None:
    check()
    row = TournamentRound.objects.select_for_update().select_related('tournament').get(pk=identity)
    event = Tournament.objects.select_for_update().get(pk=row.tournament_id)
    if row.status == 'done' or event.status != 'active' or row.matches.exclude(status='done').exists():
        return
    row.status, row.completed_at = 'done', storage_time(local_time(now))
    row.save(update_fields=['status', 'completed_at'])
    main = list(row.matches.filter(kind='main').order_by('number'))
    winners = [m.result['winner_id'] for m in main if m.result.get('winner_id')]
    if row.phase == 'final':
        match = main[0] if main else None
        podium = {'1': match.result.get('winner_id', ''), '2': match.result.get('loser_id', '')} if match else {}
        bronze = row.matches.filter(kind='bronze').first()
        candidates = event.result.get('bronze_candidates', [])
        podium['3'] = bronze.result.get('winner_id', '') if bronze else candidates[0] if len(candidates) == 1 else ''
        finish_event(event, podium, now)
        return
    if len(row.entrants) in (3, 4) and row.phase != 'preliminary':
        event.result = {**event.result, 'bronze_candidates': [m.result['loser_id'] for m in main if m.result.get('loser_id')]}
        event.save(update_fields=['result'])
    if len(winners) <= 1:
        finish_event(event, {'1': winners[0]} if winners else {}, now)
        return
    if row.phase == 'preliminary':
        phase = 'preliminary' if len(winners) > 64 else 'main'
        due = local_time(row.scheduled_at) if phase == 'preliminary' else at_two(event.week) + timedelta(days=1)
    else:
        phase, due = 'main', local_time(row.scheduled_at) + timedelta(days=1)
    make_round(event, winners, due, phase)
