"""Read-only projections; reports are loaded only for the selected match."""
from .life_time import local_time
from .tournament_models import Tournament, TournamentMatch
from .tournament_rules import at_two, next_sunday


def iso(value):
    return local_time(value).isoformat() if value else None


def summary(event: Tournament) -> dict:
    due = event.rounds.filter(status='pending').order_by('number').first()
    return {'id': event.pk, 'week': event.week.isoformat(), 'status': event.status,
            'participant_count': len(event.roster), 'roster': event.roster, 'result': event.result,
            'created_at': iso(event.created_at), 'ended_at': iso(event.ended_at),
            'next_round_at': iso(due.scheduled_at) if due else None}


def match_summary(match: TournamentMatch) -> dict:
    return {'id': match.pk, 'number': match.number, 'kind': match.kind, 'left_id': match.left_id,
            'right_id': match.right_id, 'status': match.status, 'result': match.result, 'played_at': iso(match.played_at)}


def detail(event: Tournament) -> dict:
    return {**summary(event), 'rounds': [{'id': row.pk, 'number': row.number, 'phase': row.phase,
        'entrant_count': len(row.entrants), 'status': row.status, 'scheduled_at': iso(row.scheduled_at),
        'completed_at': iso(row.completed_at), 'matches': [match_summary(m) for m in row.matches.order_by('number')]}
        for row in event.rounds.order_by('number').prefetch_related('matches')],
        'rewards': [{'id': row.pk, 'place': row.place, 'actor_id': row.actor_id, 'status': row.status,
                     'result': row.result, 'granted_at': iso(row.granted_at)} for row in event.rewards.order_by('place')]}


def overview(owner: str) -> dict:
    from .tournament_runner import enabled
    from .tournament_models import TournamentRuntime
    from .tournament_rules import key
    event = Tournament.objects.filter(owner_id=owner).order_by('-week').first()
    runtime = TournamentRuntime.objects.filter(pk=key('calendar', owner)).first()
    point = local_time()
    day = runtime.first_sunday if runtime and runtime.first_sunday and runtime.first_sunday > point.date() else next_sunday(point.date())
    if point.weekday() == 6 and runtime and runtime.first_sunday and point.date() >= runtime.first_sunday and point < at_two(point.date()):
        day = point.date()
    return {'event': detail(event) if event else None, 'auto_enabled': enabled(), 'next_draw_at': at_two(day).isoformat()}
