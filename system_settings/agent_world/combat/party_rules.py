"""Versioned party arithmetic. Pure functions; no database, wall clock or model calls."""
import math
from decimal import Decimal, ROUND_HALF_UP
from .catalog import Catalog

CADENCE = {1: 15, 2: 8, 3: 5, 4: 3}
MULTIPLIER = {1: 1, 2: 1.5, 3: 2, 4: 2.5}
COUNTS = {1: (1, 1), 2: (1, 2), 3: (2, 3), 4: (2, 4)}
MIN_JOIN_SECONDS = 600
SCALED = ('hp_max', 'physical_attack', 'magic_attack', 'physical_defense', 'magic_defense')


def scaled_monster(catalog: Catalog, stats: dict, count: int) -> dict:
    # Rewards retain MULTIPLIER; old frozen catalogs retain their original difficulty.
    multiplier = catalog.rules.get(f'party_monster_multiplier_{count}', MULTIPLIER[count])
    return {key: math.floor(value * multiplier) if key in SCALED else value for key, value in stats.items()}


def speed(entity):
    return max(1, int(entity['stats'].get('speed', entity['stats'].get('dexterity', 1))))


def equipment_chance(base, bonuses, interval=300):
    rate = min(Decimal(100), max(Decimal(0), Decimal(str(bonuses.get('maze_equipment_interval_reduction_percentage', 0)))))
    shortened = max(1, int((Decimal(interval) * (1 - rate / 100)).quantize(Decimal('1'), rounding=ROUND_HALF_UP)))
    extra = max(Decimal(0), Decimal(str(bonuses.get('maze_equipment_drop_bonus_percentage', 0)))) / 100
    return min(1., float((Decimal(str(base)) + extra) * interval / shortened))


def roll(participants, rng):
    """Return the winner and every tie-break round, for immutable replay."""
    pending = sorted(participants)
    if not pending:
        raise ValueError('没有合法战利品参与者')
    rounds = []
    while True:
        scores = {identity: rng.randint(1, 100) for identity in pending}
        rounds.append(scores)
        highest = max(scores.values())
        pending = [identity for identity, value in scores.items() if value == highest]
        if len(pending) == 1:
            return pending[0], rounds


def spawn_enemies(catalog, dungeon, players, state, rng, identity, number):
    from . import attributes, engine
    count = len(players)
    mean = sum(p['level'] for p in players.values())//count
    for player in players.values():
        player['revived'] = False
        player['encounter'] = number
        player['round_in_encounter'] = 0
    kills = state.get('nonboss_kills', 0)
    probability = min(float(dungeon['boss_probability_cap']), float(dungeon['boss_probability_step'])*max(0, kills-int(dungeon['boss_start_kills'])+1))
    boss = bool(dungeon.get('boss_id')) and not state.get('boss_seen') and rng.random() < probability and catalog.row('monsters', dungeon['boss_id'])['enabled']=='1'
    options = [r for r in catalog.tables['dungeon_monsters'] if r['dungeon_id']==dungeon['id'] and r['enabled']=='1' and catalog.row('monsters', r['monster_id'])['enabled']=='1']
    ordinary = [r for r in options if catalog.row('monsters', r['monster_id'])['rank']=='normal']
    total = rng.randint(*COUNTS[count])
    enemies = {}
    for index in range(total):
        if index==0 and boss:
            sid = dungeon['boss_id']
            level = rng.randint(int(dungeon['boss_level_min']), int(dungeon['boss_level_max']))
            state['boss_seen'] = True
        else:
            pool = options if index==0 else ordinary
            row = rng.choices(pool, weights=[float(r['encounter_weight']) for r in pool])[0]
            sid = row['monster_id']
            level = max(int(row['level_min']), min(int(row['level_max']), mean+rng.randint(-2, 2)))
        template = catalog.row('monsters', sid)
        stats = scaled_monster(catalog, attributes.monster(catalog, template, level), count)
        multiplier = float(catalog.row('monster_profiles', template['profile']).get('speed_multiplier', 1))
        stats['speed'] = max(1, int((5+2*(level-1))*multiplier))
        enemy = engine.fighter(stats, template['name'], level, rank=template['rank'])
        unit_id = f'{identity}:w{number}:m{index}'
        enemy.update(id=unit_id, template_id=sid, threat={}, settled=False)
        enemies[unit_id] = enemy
    return enemies


def experience(catalog, monster_level, actor_level, rank, count, bonus=0):
    from . import attributes
    share = attributes.base_kill_experience(catalog,monster_level,rank)*MULTIPLIER[count]/count
    return attributes.apply_experience_bonus(attributes.kill_experience(catalog,monster_level,actor_level,rank,share=share),bonus)

