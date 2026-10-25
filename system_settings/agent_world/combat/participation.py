"""Read actual wave rosters; a shared session alone does not imply group play."""
import re

from .models import CombatEncounter, Exploration
from .party_models import AdventureParty, AdventureWave


def participation(runs: list[Exploration], owner: str) -> dict[str, dict[str, int]]:
    party_ids = {run.snapshot.get('party_id') for run in runs} - {None, ''}
    waves = {}
    for wave in AdventureWave.objects.filter(owner_id=owner, party_id__in=party_ids).order_by('number'):
        waves.setdefault(wave.party_id, []).append(wave)
    parties = AdventureParty.objects.filter(owner_id=owner, pk__in=party_ids).in_bulk()
    encounters = set(CombatEncounter.objects.filter(owner_id=owner,
        exploration_id__in=[run.pk for run in runs]).values_list('pk', flat=True))
    result = {}
    for run in runs:
        identity = run.snapshot.get('party_id')
        counts = [len(wave.snapshot['members']) for wave in waves.get(identity, [])
                  if run.actor_id in wave.snapshot.get('members', [])
                  and f'{run.pk}:party:{wave.number}' in encounters]
        if not counts:
            final = run.snapshot.get('party_final')
            players = (final or {}).get('players') if final else (
                parties[identity].state.get('players') if identity in parties else None)
            if players:
                counts = [len(players)]
            elif not identity and not run.snapshot.get('target_party_id'):
                counts = [1]  # Frozen legacy engine was exclusively single-player.
        if counts:
            result[run.pk] = {'min': min(counts), 'max': max(counts), 'final': counts[-1]}
    return result


def display_report(report: str, roster: dict[str, int] | None) -> str:
    text = report.replace('（按怪物去重）', '')
    if roster and roster['final'] == 1:
        text = text.replace('全队倒地', '角色倒地')
    if roster and roster['max'] == 1:
        text = re.sub(r'\s*本人参与击败\d+只[，,]离队时队伍累计击败\d+只[。.]?', '', text)
    return text
