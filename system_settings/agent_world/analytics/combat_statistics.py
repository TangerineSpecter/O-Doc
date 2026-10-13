"""Read-only departure-cohort combat statistics, scoped to the authenticated owner."""
from ..combat.models import CombatFact, CombatEncounter, Exploration

OPEN = {'preparing', 'active', 'paused', 'settling'}


def count(value):
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def aggregate_combat(residents, runs, encounters):
    rows = {actor: {**resident, 'explorations': 0, 'settled': 0, 'completed': 0,
        'ongoing': 0, 'fallen': 0, 'recalled': 0, 'exhausted': 0, 'otherEnded': 0,
        'kills': 0, 'bossKills': 0, 'experience': 0, 'elapsedSeconds': 0,
        'longestSeconds': 0, 'energy': 0, 'potions': 0, 'monsters': {}, 'destinations': set()}
        for actor, resident in residents.items()}
    seen = set()
    for run in runs:
        row = rows.get(run.actor_id)
        if row is None or run.pk in seen:
            continue
        seen.add(run.pk)
        row['explorations'] += 1
        if run.status in OPEN:
            row['ongoing'] += 1
        else:
            row['settled'] += 1
            row[run.status if run.status in ('completed', 'fallen', 'recalled', 'exhausted') else 'otherEnded'] += 1
        result = run.result or {}
        row['kills'] += count(result.get('kills'))
        row['experience'] += count(result.get('experience'))
        elapsed = count(run.elapsed_seconds)
        row['elapsedSeconds'] += elapsed
        row['longestSeconds'] = max(row['longestSeconds'], elapsed)
        row['energy'] += count(result.get('energy'))
        row['potions'] += sum(count(amount) for amount in (result.get('potions_used') or {}).values())
        destination = (run.snapshot.get('plan') or {}).get('dungeon_id')
        if destination:
            row['destinations'].add(destination)
    seen_encounters = set()
    for encounter in encounters:
        row = rows.get(encounter.actor_id)
        if row is None or encounter.exploration_id not in seen or encounter.pk in seen_encounters or not encounter.result.get('killed'):
            continue
        seen_encounters.add(encounter.pk)
        monster = encounter.monster or {}
        key = monster.get('id') or 'unknown'
        detail = row['monsters'].setdefault(key, {'id': key, 'name': monster.get('name') or '未记录魔物', 'kills': 0, 'highestLevel': 0})
        detail['kills'] += 1
        detail['highestLevel'] = max(detail['highestLevel'], count(monster.get('level')))
        row['bossKills'] += monster.get('rank') == 'boss'
    for row in rows.values():
        row['successRate'] = round(100 * row['completed'] / row['settled'], 1) if row['settled'] else None
        row['averageSeconds'] = round(row['elapsedSeconds'] / row['explorations']) if row['explorations'] else 0
        row['killsPerHour'] = round(row['kills'] * 3600 / row['elapsedSeconds'], 1) if row['elapsedSeconds'] else None
        row['destinations'] = len(row['destinations'])
        row['monsters'] = sorted(row['monsters'].values(), key=lambda item: (-item['kills'], item['id']))
        row['unclassifiedKills'] = max(0, row['kills'] - sum(item['kills'] for item in row['monsters']))
    return sorted(rows.values(), key=lambda row: (-row['kills'], -row['bossKills'], -row['experience'], row['id']))


def load_combat_statistics(owner, start, end, residents):
    # Actual departures, not preparation requests or mutable timestamps, define the cohort.
    ids = CombatFact.objects.filter(owner_id=owner, actor_id__in=residents, kind='depart',
        created_at__gte=start, created_at__lt=end).values_list('exploration_id', flat=True).distinct()
    runs = list(Exploration.objects.filter(owner_id=owner, actor_id__in=residents, pk__in=ids))
    encounters = CombatEncounter.objects.filter(owner_id=owner, actor_id__in=residents,
        exploration_id__in=[run.pk for run in runs], result__killed=True)
    return aggregate_combat(residents, runs, encounters)
