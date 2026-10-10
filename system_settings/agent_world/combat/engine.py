"""One logical round; takes snapshots and returns snapshots, never performs I/O."""
import math
from copy import deepcopy
from .catalog import Catalog
from .effects import apply, clamp, upkeep, expire


def fighter(stats: dict, name: str, level: int, *, hp=None, mp=None, skills=None, passives=None, rank='normal') -> dict:
    return {'stats': stats, 'name': name, 'level': level, 'hp': stats['hp_max'] if hp is None else hp,
            'mp': stats['mp_max'] if mp is None else mp, 'skills': skills or {}, 'passives': passives or [],
            'rank': rank, 'states': [], 'cooldowns': {}, 'potion_cooldowns': {}, 'defending': False}


def cost(catalog: Catalog, entity: dict, identity: str, rank: int) -> int:
    row, _ = catalog.skill(identity, rank)
    discount = sum(float(e['value']) for e in entity['passives'] if e['code'] == 'passive_cost')
    return max(1, math.ceil((float(row['cost_base']) + float(row['cost_per_level']) * entity['level']) * float(row['cost_rank_factor']) * (1 - clamp(discount, 0, .9))))


def available(catalog: Catalog, player: dict, enemy: dict, tick: int, style: dict) -> list[tuple[str, int, float]]:
    result = []
    h = player['hp'] / player['stats']['hp_max']
    m = player['mp'] / max(1, player['stats']['mp_max'])
    t = clamp((enemy['level'] - player['level']) / 10)
    c = clamp((.35 - h) / .35)
    for sid, rank in player['skills'].items():
        definition = catalog.row('skills', sid)
        if definition['kind'] == 'passive' or tick < player['cooldowns'].get(sid, 0) or player['mp'] < cost(catalog, player, sid, rank):
            continue
        _, effects = catalog.skill(sid, rank)
        choices = []
        if any(e['code'] in ('damage', 'dot') for e in effects):
            q = 1.3 if style['id'] == 'style.assault' else 1
            if style['id'] == 'style.economy':
                q *= clamp(.35 + .65 * t, .35, 1) * (.5 + .5 * m)
            choices.append(q)
        if any(e['code'] in ('heal', 'hot') for e in effects) and h < 1:
            choices.append(2 * (1 - h) * (1 + t + c))
        for fx in effects:
            if fx['code'] not in ('modifier', 'shield'):
                continue
            receiver = player if fx['target'] == 'self' else enemy
            if any(s['group'] == fx['group'] for s in receiver['states']):
                continue
            q = .3 + t + c if receiver is player else .6 + t
            if receiver is player and style['id'] == 'style.cautious':
                q *= 1.5
            choices.append(q)
        if choices and max(choices) > 0:
            result.append((sid, rank, max(choices)))
    return result


def potion(catalog: Catalog, entity: dict, carried: dict, kind: str, tick: int):
    if tick < entity['potion_cooldowns'].get(kind, 0):
        return None
    missing = entity['stats']['hp_max' if kind == 'heal' else 'mp_max'] - entity['hp' if kind == 'heal' else 'mp']
    rows = [catalog.row('potions', sid) for sid, count in carried.items() if count > 0]
    rows = [r for r in rows if r['kind'] == kind and int(r['required_level']) <= entity['level']]
    if not rows or missing <= 0:
        return None
    return min(rows, key=lambda r: (abs(int(r['restore_value']) - missing), int(r['restore_value'])))


def player_action(catalog: Catalog, player: dict, enemy: dict, carried: dict, tick: int, style: dict, rng) -> list[dict]:
    skills = available(catalog, player, enemy, tick, style)
    h = player['hp'] / player['stats']['hp_max']
    m = player['mp'] / max(1, player['stats']['mp_max'])
    t, c = clamp((enemy['level'] - player['level']) / 10), clamp((.35 - h) / .35)
    heal = potion(catalog, player, carried, 'heal', tick)
    mana = potion(catalog, player, carried, 'mana', tick) if any(catalog.row('skills', s)['kind'] == 'active' for s in player['skills']) else None
    H, M = float(style['heal_threshold']), float(style['mana_threshold'])
    weights = {'attack': float(style['attack_weight']), 'skill': float(style['skill_weight']) * max((s[2] for s in skills), default=0),
               'heal': 150 * clamp((H - h) / H) * (1 + t + c) if heal else 0,
               'mana': 100 * clamp((M - m) / M) if mana else 0,
               'defend': 20 * float(style['defend_factor']) * (.2 + t) * (.3 + c)}
    action = rng.choices(list(weights), weights=list(weights.values()))[0]
    if action == 'skill':
        sid, rank, _ = rng.choices(skills, weights=[s[2] for s in skills])[0]
        row, effects = catalog.skill(sid, rank)
        player['mp'] -= cost(catalog, player, sid, rank)
        player['cooldowns'][sid] = tick + int(row['cooldown_rounds'])
        return apply(catalog, player, enemy, effects, catalog.row('skills', sid)['name'], tick, rng)
    if action in ('heal', 'mana'):
        row = heal if action == 'heal' else mana
        field = 'hp' if action == 'heal' else 'mp'
        before = player[field]
        player[field] = min(player['stats'][field + '_max'], player[field] + int(row['restore_value']))
        carried[row['id']] -= 1
        player['potion_cooldowns'][action] = tick + int(row['shared_cooldown_rounds'])
        return [{'actor': player['name'], 'action': row['name'], 'kind': 'potion', 'potion_id': row['id'], 'restored': player[field] - before}]
    if action == 'defend':
        player['defending'] = True
        return [{'actor': player['name'], 'action': '防御', 'kind': 'defend'}]
    return attack(catalog, player, enemy, tick, rng)


def attack(catalog: Catalog, entity: dict, target: dict, tick: int, rng) -> list[dict]:
    kind = entity['stats']['damage_type']
    return apply(catalog, entity, target, [{'code': 'damage', 'stat': kind + '_attack', 'value': 1, 'hits': 1, 'damage_type': kind}], '普通攻击', tick, rng)


def enemy_action(catalog: Catalog, enemy: dict, player: dict, template_id: str, tick: int, rng) -> list[dict]:
    moves = []
    for row in catalog.tables['monster_actions']:
        if row['monster_id'] != template_id:
            continue
        sid = row['skill_id']
        if sid:
            if catalog.row('skills',sid)['enabled']!='1':continue
            _, effects = catalog.skill(sid, 1)
            if tick < enemy['cooldowns'].get(sid, 0) or enemy['mp'] < cost(catalog, enemy, sid, 1):
                continue
            if row['condition'] == 'hp_below_50' and enemy['hp'] >= enemy['stats']['hp_max'] * .5:
                continue
            if row['condition'] == 'not_active' and any(s['group'] in {e['group'] for e in effects} for s in enemy['states']):
                continue
        moves.append(row)
    row = rng.choices(moves, weights=[float(r['weight']) for r in moves])[0]
    if row['action_kind'] == 'attack':
        return attack(catalog, enemy, player, tick, rng)
    sid = row['skill_id']
    rank, effects = catalog.skill(sid, 1)
    enemy['mp'] -= cost(catalog, enemy, sid, 1)
    enemy['cooldowns'][sid] = tick + int(rank['cooldown_rounds'])
    return apply(catalog, enemy, player, effects, catalog.row('skills', sid)['name'], tick, rng)


def step(catalog: Catalog, state: dict, style_id: str, tick: int, rng, *, waiting=False) -> tuple[dict, list[dict]]:
    result = deepcopy(state)
    player, enemy = result['player'], result.get('enemy')
    events = []
    player['defending'] = False
    upkeep(player, tick, events)
    if player['hp'] <= 0 or waiting or not enemy:
        return result, events
    expire(enemy, tick)
    events.extend(player_action(catalog, player, enemy, result['potions'], tick, catalog.row('styles', style_id), rng))
    if enemy['hp'] > 0:
        upkeep(enemy, tick, events)
        if enemy['hp'] > 0:
            events.extend(enemy_action(catalog, enemy, player, result['monster_id'], tick, rng))
    player['defending'] = False
    return result, events
