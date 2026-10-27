"""Isolated water design probe; does not install or mutate a combat catalog.

This is an early single-boss diagnostic, not the full exploration or party acceptance.
"""
import argparse
import copy
import json
import random
import statistics
import sys
from functools import lru_cache
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from system_settings.agent_world.combat import attributes, engine, rewards
from system_settings.agent_world.combat.catalog import Catalog, bundled
from system_settings.agent_world.combat.party_engine import alive, step_in_place as party_step
from system_settings.agent_world.combat.party_rules import COUNTS, scaled_monster
from scripts.combat_design.evaluate_bards import loadout
from scripts.combat_design.evaluate_engine import progress_at, supplies


BOSS = 'monster.draft.tide_crown'
CRAB = 'monster.draft.bubble_crab'
SPIRIT = 'monster.draft.water_spirit'
GUARD = 'monster.draft.reef_guard'
DUNGEON = 'dungeon.draft.tidal_shoal'


@lru_cache(maxsize=None)
def _regular_template_plan(catalog, job, level):
    """Select eligible ordinary silhouettes once per immutable catalog and job."""
    from system_settings.agent_world.combat import equipment
    initial = loadout(catalog, job, level, random.Random(0))
    result = []
    for item in initial:
        original = catalog.row('equipment_templates', item['template_id'])
        candidates = [row for row in catalog.tables['equipment_templates']
                      if row['slot'] == original['slot']
                      and row.get('equipment_type') == original.get('equipment_type')
                      and row.get('boss_only') != '1' and not row.get('element')
                      and int(row['level_min']) <= level
                      and equipment.allowed(catalog, row['id'], job, level,
                                            min(level, int(row['level_max'])))]
        if not candidates:
            continue
        template = max(candidates, key=lambda row: min(level, int(row['level_max'])))
        actual = min(level, int(template['level_max']))
        result.append((template['id'], actual))
    if not any(catalog.row('equipment_templates', identity)['slot'] == 'weapon' for identity, _ in result):
        raise ValueError(f'No ordinary weapon for {job} at level {level}')
    return tuple(result)


@lru_cache(maxsize=None)
def fixed_progress(catalog, job, level):
    return progress_at(catalog, job, level)


def regular_loadout(catalog, job, level, rng, quality='mixed', weapon_element=None):
    """Legal ordinary gear only; earlier generic fixtures could pick Boss trophies."""
    from system_settings.agent_world.combat import equipment
    result = []
    for index, (identity, actual) in enumerate(_regular_template_plan(catalog, job, level)):
        template = catalog.row('equipment_templates', identity)
        if weapon_element and template['slot'] == 'weapon':
            minimum, maximum = {'water': (15, 25), 'earth': (22, 32),
                                'wind': (30, 40), 'fire': (38, 48)}[weapon_element]
            matches = []
            for row in catalog.tables['equipment_templates']:
                if row.get('element') != weapon_element or row.get('equipment_type') != template.get('equipment_type'):
                    continue
                candidate_level = min(level, maximum, int(row['level_max']))
                if candidate_level < max(minimum, int(row['level_min'])):
                    continue
                if equipment.allowed(catalog, row['id'], job, level, candidate_level):
                    matches.append((candidate_level, row['id']))
            if not matches:
                raise ValueError(f'No obtainable {weapon_element} variant for {identity} at level {level}')
            actual, identity = max(matches)
        item_quality = ('white' if index % 2 == 0 else 'blue') if quality == 'mixed' else quality
        result.append(equipment.generate(catalog, identity, actual, item_quality, rng))
    return result


def draft_catalog():
    current = bundled()[0]
    tables = copy.deepcopy(current.tables)
    profile = {**next(x for x in tables['monster_profiles'] if x['id'] == 'magic'),
               'id': 'draft.water_magic', 'element_curve': 'element_v1'}
    tables['monster_profiles'].append(profile)
    tables['monster_profiles'].append({**profile, 'id': 'draft.water_physical', 'damage_type': 'physical'})
    original = next(x for x in tables['monsters'] if x['id'] == 'monster.tide_priest')
    tables['monsters'].append({**original, 'id': BOSS, 'name': '潮冠海兽',
                               'profile': profile['id'], 'level_min': '23', 'level_max': '25',
                               'attack_multiplier': '1'})
    for identity, name, rank, profile_id, low, high in (
        (CRAB, '泡泡寄居蟹', 'normal', 'draft.water_physical', 15, 22),
        (SPIRIT, '小潮水灵', 'normal', 'draft.water_magic', 15, 22),
        (GUARD, '礁壳守卫', 'elite', 'draft.water_physical', 19, 24),
    ):
        tables['monsters'].append({**original, 'id': identity, 'name': name, 'rank': rank,
                                   'profile': profile_id, 'level_min': str(low), 'level_max': str(high),
                                   'attack_multiplier': '1'})
    for identity, water, earth in ((CRAB, '.15', '-.10'), (SPIRIT, '.15', '-.10'),
                                   (GUARD, '.20', '-.15'), (BOSS, '.25', '-.20')):
        tables['monster_resists'].extend([
            {'id': identity + '.water', 'monster_id': identity, 'element': 'water', 'value': water},
            {'id': identity + '.earth', 'monster_id': identity, 'element': 'earth', 'value': earth},
        ])
    base_dungeon = next(x for x in tables['dungeons'] if x['id'] == 'dungeon.moss_cave')
    tables['dungeons'].append({**base_dungeon, 'id': DUNGEON, 'name': '潮汐浅湾', 'boss_id': BOSS,
                               'recommended_level_min': '15', 'recommended_level_max': '25',
                               'boss_level_min': '23', 'boss_level_max': '25',
                               'equipment_level_min': '15', 'equipment_level_max': '25'})
    for identity, low, high, weight in ((CRAB, 15, 22, 60), (SPIRIT, 15, 22, 35), (GUARD, 19, 24, 5)):
        tables['dungeon_monsters'].append({'id': DUNGEON + '.' + identity, 'dungeon_id': DUNGEON,
            'monster_id': identity, 'level_min': str(low), 'level_max': str(high),
            'encounter_weight': str(weight), 'drop_table_id': 'drop.' + identity.removeprefix('monster.'), 'enabled': '1'})
    # Existing material/pool are placeholders solely for estimating drop volumes.
    base_drops = [row for row in tables['drops'] if row['monster_id'] == 'monster.cave_bat']
    for identity in (CRAB, SPIRIT, GUARD, BOSS):
        for row in base_drops:
            tables['drops'].append({**row, 'id': identity + '.' + row['item_kind'], 'monster_id': identity})
    skills = [
        ('surge', '潮涌', '4', [('damage', 'magic_attack', '1.25', '0', 'enemy', 'magic', '', 'water')]),
        ('bubble_shield', '泡沫屏障', '6', [('shield', 'hp_max', '.08', '2', 'self', '', 'bubble_shield', '')]),
        ('bubble_hit', '泡泡撞击', '4', [('damage', 'physical_attack', '1.10', '0', 'enemy', 'physical', '', 'water'),
                                          ('modifier', 'physical_defense', '-.10', '2', 'enemy', '', 'bubble_armor', '')]),
        ('backwash', '回流波', '5', [('damage', 'magic_attack', '.85', '0', 'enemy', 'magic', '', 'water'),
                                       ('heal', 'hp_max', '.04', '0', 'self', '', '', '')]),
        ('reef_shell', '珊瑚护壳', '5', [('shield', 'hp_max', '.08', '2', 'self', '', 'reef_shell', '')]),
    ]
    for name, label, cooldown, effects in skills:
        sid = 'skill.monster.draft.' + name
        level_id = sid + '.r1'
        tables['skills'].append({'id': sid, 'name': label, 'profession_id': '', 'learn_level': '1', 'kind': 'monster', 'enabled': '1'})
        tables['skill_levels'].append({'id': level_id, 'skill_id': sid, 'rank': '1', 'required_level': '1',
                                       'cost_base': '4', 'cost_per_level': '.5', 'cost_rank_factor': '1',
                                       'cooldown_rounds': cooldown, 'group': name, 'enabled': '1'})
        for i, (code, stat, value, duration, target, kind, group, element) in enumerate(effects, 1):
            tables['skill_effects'].append({'id': f'{level_id}.e{i}', 'skill_level_id': level_id, 'code': code,
                'stat': stat, 'value': value, 'duration': duration, 'target': target, 'damage_type': kind,
                'group': group, 'hits': '1', 'chance': '1', 'element': element})
    tables['monster_actions'].extend([
        {'id': BOSS + '.attack', 'monster_id': BOSS, 'action_kind': 'attack', 'skill_id': '', 'weight': '65', 'condition': 'always'},
        {'id': BOSS + '.surge', 'monster_id': BOSS, 'action_kind': 'skill', 'skill_id': 'skill.monster.draft.surge', 'weight': '20', 'condition': 'always'},
        {'id': BOSS + '.shield', 'monster_id': BOSS, 'action_kind': 'skill', 'skill_id': 'skill.monster.draft.bubble_shield', 'weight': '15', 'condition': 'not_active'},
        {'id': CRAB + '.attack', 'monster_id': CRAB, 'action_kind': 'attack', 'skill_id': '', 'weight': '80', 'condition': 'always'},
        {'id': CRAB + '.bubble_hit', 'monster_id': CRAB, 'action_kind': 'skill', 'skill_id': 'skill.monster.draft.bubble_hit', 'weight': '20', 'condition': 'always'},
        {'id': SPIRIT + '.attack', 'monster_id': SPIRIT, 'action_kind': 'attack', 'skill_id': '', 'weight': '80', 'condition': 'always'},
        {'id': SPIRIT + '.backwash', 'monster_id': SPIRIT, 'action_kind': 'skill', 'skill_id': 'skill.monster.draft.backwash', 'weight': '20', 'condition': 'always'},
        {'id': GUARD + '.attack', 'monster_id': GUARD, 'action_kind': 'attack', 'skill_id': '', 'weight': '75', 'condition': 'always'},
        {'id': GUARD + '.reef_shell', 'monster_id': GUARD, 'action_kind': 'skill', 'skill_id': 'skill.monster.draft.reef_shell', 'weight': '25', 'condition': 'not_active'},
    ])
    return Catalog(tables, 'element-water-draft')


def run_sample(catalog, job, seed, *, health=1, level=20, boss_id=BOSS, boss_level=25, quality='mixed',
               weapon_element=None, potion_limit=None):
    # Historical single-fighter engine retained only for older catalog diagnostics.
    rng = random.Random(seed)
    progress = fixed_progress(catalog, job, level)
    gear = regular_loadout(catalog, job, level, rng, quality, weapon_element)
    stats = attributes.attributes(catalog, progress, gear)
    player = engine.fighter(stats, job, level, skills=progress['skills'],
                            passives=attributes.passives(catalog, progress['skills'], gear))
    player['hp'] = max(1, int(player['hp'] * health))
    player['mp'] = int(player['mp'] * health)
    template = catalog.row('monsters', boss_id)
    enemy = engine.fighter(attributes.monster(catalog, template, boss_level), template['name'], boss_level, rank='boss')
    potions = supplies(catalog, level)
    if potion_limit is not None:
        remaining = potion_limit
        for sid in sorted(potions, key=lambda sid: catalog.row('potions', sid)['kind'] != 'heal'):
            potions[sid] = min(potions[sid], remaining)
            remaining -= potions[sid]
    state = {'player': player, 'enemy': enemy, 'potions': dict(potions), 'monster_id': boss_id}
    for tick in range(1, 121):
        state, _ = engine.step(catalog, state, 'style.balanced', tick, rng)
        if state['player']['hp'] <= 0 or state['enemy']['hp'] <= 0:
            break
    return {'won': state['enemy']['hp'] <= 0 and state['player']['hp'] > 0,
            'rounds': tick, 'hp_remaining': state['player']['hp'],
            'potions_used': sum(potions.values()) - sum(state['potions'].values())}


def run_party_sample(catalog, jobs, seed, *, health=1, level=20, boss_id=BOSS, boss_level=25,
                     dungeon_id=None, potion_limit=None, quality='mixed', weapon_element=None):
    rng = random.Random(seed)
    players = {}
    for index, job in enumerate(jobs):
        progress = fixed_progress(catalog, job, level)
        gear = regular_loadout(catalog, job, level, rng, quality, weapon_element)
        stats = attributes.attributes(catalog, progress, gear)
        unit = engine.fighter(stats, job, level, skills=progress['skills'],
                              passives=attributes.passives(catalog, progress['skills'], gear))
        potions = supplies(catalog, level)
        if potion_limit is not None:
            remaining = potion_limit
            for sid in sorted(potions, key=lambda sid: catalog.row('potions', sid)['kind'] != 'heal'):
                potions[sid] = min(potions[sid], remaining)
                remaining -= potions[sid]
        unit.update(id=f'p{index}', job_id=job, potions=potions,
                    style_id='style.balanced', elixirs=[])
        unit['hp'] = max(1, int(unit['hp'] * health))
        unit['mp'] = int(unit['mp'] * health)
        players[unit['id']] = unit
    count = len(players)
    enemies = {}
    # Boss waves use the same encounter count as the current production party rules.
    for index in range(rng.randint(*COUNTS[count])):
        identity = boss_id if index == 0 else CRAB
        if index and dungeon_id:
            choices = [row for row in catalog.tables['dungeon_monsters'] if row['dungeon_id'] == dungeon_id
                       and catalog.row('monsters', row['monster_id'])['rank'] == 'normal']
            choice = rng.choices(choices, weights=[float(row['encounter_weight']) for row in choices])[0]
            identity = choice['monster_id']
        template = catalog.row('monsters', identity)
        monster_level = boss_level if index == 0 else max(int(template['level_min']), min(int(template['level_max']), level + rng.randint(-2, 2)))
        stats = scaled_monster(catalog, attributes.monster(catalog, template, monster_level), count)
        speed_factor = float(catalog.row('monster_profiles', template['profile']).get('speed_multiplier', 1))
        stats['speed'] = max(1, int((5 + 2 * (monster_level - 1)) * speed_factor))
        unit = engine.fighter(stats, template['name'], monster_level, rank=template['rank'])
        unit.update(id=f'e{index}', template_id=identity, threat={}, settled=False)
        enemies[unit['id']] = unit
    state = {'players': players, 'enemies': enemies, 'round': 0}
    fallen = set()
    initial_potions = sum(sum(unit['potions'].values()) for unit in players.values())
    for tick in range(1, 121):
        state, events = party_step(catalog, state, rng)
        fallen.update(key for key, unit in state['players'].items() if unit['hp'] <= 0)
        fallen.update(e['target_id'] for e in events if e['kind'] == 'revive')
        if not alive(state['players']) or not alive(state['enemies']):
            break
    return {'won': not alive(state['enemies']) and bool(alive(state['players'])),
            'rounds': tick, 'any_fallen': bool(fallen),
            'potions_used': initial_potions - sum(sum(unit['potions'].values()) for unit in state['players'].values())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--seeds', type=int, default=500)
    args = parser.parse_args()
    catalog = draft_catalog()
    rows = []
    for health in (1, .5):
        for job in ('job.warrior', 'job.mage', 'job.ranger', 'job.priest', 'job.bard'):
            samples = [run_sample(catalog, job, 202610270000 + n, health=health) for n in range(args.seeds)]
            wins = sum(x['won'] for x in samples)
            rows.append({'job': job, 'starting_hp_mp': health, 'samples': len(samples), 'wins': wins,
                         'win_rate': wins / len(samples), 'median_rounds': statistics.median(x['rounds'] for x in samples),
                         'mean_potions': round(statistics.mean(x['potions_used'] for x in samples), 2)})
    party_rows = []
    for jobs in (('job.warrior', 'job.ranger'), ('job.warrior', 'job.mage', 'job.ranger'),
                 ('job.warrior', 'job.mage', 'job.ranger', 'job.bard'),
                 ('job.warrior', 'job.mage', 'job.ranger', 'job.priest')):
        for health in (1, .5):
            samples = [run_party_sample(catalog, jobs, 202610270000 + n, health=health) for n in range(args.seeds)]
            party_rows.append({'jobs': jobs, 'starting_hp_mp': health, 'samples': len(samples),
                               'win_rate': sum(x['won'] for x in samples) / len(samples),
                               'any_fallen_rate': sum(x['any_fallen'] for x in samples) / len(samples),
                               'median_rounds': statistics.median(x['rounds'] for x in samples)})
    print(json.dumps({'scope': '隔离候选：20级蓝装对25级水Boss，14红6蓝，均衡风格；组队按人数生成Boss和随行寄居蟹',
                      'limitations': '单人采用旧单人引擎，不适用于当前目录；仅孤立Boss波次，不含完整探索、收益、其他随行怪、元素武器及实际模型，不能作为验收',
                      'solo': rows, 'party': party_rows}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
