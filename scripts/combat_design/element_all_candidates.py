"""Build four-element combat content in memory. Never installs a released catalog."""
from copy import deepcopy
from decimal import Decimal
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from scripts.combat_design.element_water_candidate import _copy_equipment, candidate as water_candidate
from system_settings.agent_world.combat.catalog import Catalog, bundled
from system_settings.agent_world.combat.catalog_validation import validate_tables

# Effect tuples: code, scaling stat, multiplier, duration, target, channel, group, element.
def damage(stat, amount, channel, element):
    return ('damage', stat, amount, 0, 'enemy', channel, '', element)
def mod(stat, amount, target, group):
    return ('modifier', stat, amount, 2, target, '', group, '')
def dot(stat, amount, channel, element, group):
    return ('dot', stat, amount, 2, 'enemy', channel, group, element)

# Each action is (id, display name, cooldown, weight, condition, effects).
CONFIGS = [
    ('earth', '琥岩地窟', 22, 32, 'wind', [
        ('mole', '砂晶鼹鼠', 'normal', 22, 29, 'physical', [('sand', '晶砂扑击', 4, 20, 'always', [damage('physical_attack',1.1,'physical','earth'), mod('accuracy',-.05,'enemy','sand_accuracy')])]),
        ('snail', '岩芽蜗牛', 'normal', 22, 29, 'physical', [('shell', '岩壳收缩', 5, 20, 'not_active', [mod('reduction',.12,'self','rock_shell')])]),
        ('armored', '琥岩甲兽', 'elite', 26, 31, 'physical', [('shatter', '砂岩碎甲', 4, 25, 'always', [damage('physical_attack',1.05,'physical','earth'),mod('physical_defense',-.12,'enemy','sand_armor')])]),
        ('dragon', '晶脊地龙', 'boss', 30, 32, 'physical', [('quake', '晶脊震荡', 4, 20, 'always', [damage('physical_attack',1.25,'physical','earth')]), ('guard', '琥岩护体', 6, 15, 'not_active', [mod('reduction',.15,'self','amber_guard')])]),
    ]),
    ('wind', '浮岚高地', 30, 40, 'fire', [
        ('cloudbird', '云绒鸟', 'normal', 30, 37, 'physical', [('feather', '旋羽', 4, 20, 'always', [damage('physical_attack',1.1,'physical','wind')])]),
        ('bell', '风铃精', 'normal', 30, 37, 'magic', [('bellwind', '风铃回旋', 5, 20, 'always', [damage('magic_attack',.95,'magic','wind'),mod('evasion',.05,'self','bell_evasion')])]),
        ('falcon', '岚羽猎隼', 'elite', 34, 39, 'physical', [('skim', '掠风', 5, 25, 'always', [damage('physical_attack',1.15,'physical','wind'),mod('evasion',.05,'self','falcon_evasion')])]),
        ('griffin', '云冠风鹫', 'boss', 38, 40, 'physical', [('ring', '云环切', 4, 20, 'always', [damage('physical_attack',1.2,'physical','wind')]), ('tailwind', '顺风', 6, 15, 'not_active', [mod('evasion',.08,'self','boss_evasion')])]),
    ]),
    ('fire', '熔羽火山', 38, 48, 'water', [
        ('lizard', '火绒蜥', 'normal', 38, 45, 'magic', [('spark', '火星吐息', 4, 20, 'always', [damage('magic_attack',1.05,'magic','fire')])]),
        ('turtle', '炭壳龟', 'normal', 38, 45, 'physical', [('embers', '炭壳余温', 5, 20, 'always', [damage('physical_attack',.9,'physical','fire'),dot('physical_attack',.08,'physical','fire','char_burn')])]),
        ('horn', '熔角兽', 'elite', 42, 47, 'physical', [('trace', '熔角灼痕', 5, 25, 'always', [damage('physical_attack',1.05,'physical','fire'),dot('physical_attack',.1,'physical','fire','horn_burn')])]),
        ('firebird', '焰羽炎鸟', 'boss', 46, 48, 'magic', [('feather', '焰羽迸落', 5, 20, 'always', [damage('magic_attack',1.15,'magic','fire'),dot('magic_attack',.1,'magic','fire','feather_burn')]), ('guard', '灰烬护羽', 6, 15, 'not_active', [mod('reduction',.12,'self','ash_guard')])]),
    ]),
]
MATERIAL_NAMES = {
    'mole': '砂晶碎片', 'snail': '岩芽晶粒', 'armored': '琥岩甲片', 'dragon': '晶脊龙鳞',
    'cloudbird': '云绒羽', 'bell': '风铃碎片', 'falcon': '岚羽', 'griffin': '翔云冠羽',
    'lizard': '火绒鳞', 'turtle': '炭壳碎片', 'horn': '熔角碎片', 'firebird': '焰羽',
}


def _skills(tables, element, monster, actions):
    for key, label, cooldown, weight, condition, effects in actions:
        identity = f'skill.monster.element.{element}.{key}'
        level_id = identity + '.r1'
        tables['skills'].append({'id': identity, 'name': label, 'profession_id': '', 'learn_level': '1', 'kind': 'monster', 'enabled': '1'})
        tables['skill_levels'].append({'id': level_id, 'skill_id': identity, 'rank': '1', 'required_level': '1',
            'cost_base': '4', 'cost_per_level': '.5', 'cost_rank_factor': '1', 'cooldown_rounds': str(cooldown), 'group': key, 'enabled': '1'})
        for number, (code, stat, value, duration, target, channel, group, effect_element) in enumerate(effects, 1):
            tables['skill_effects'].append({'id': f'{level_id}.e{number}', 'skill_level_id': level_id, 'code': code,
                'stat': stat, 'value': str(value), 'duration': str(duration), 'target': target, 'damage_type': channel,
                'group': group, 'hits': '1', 'chance': '1', 'element': effect_element})
        tables['monster_actions'].append({'id': monster + '.' + key, 'monster_id': monster, 'action_kind': 'skill',
                                          'skill_id': identity, 'weight': str(weight), 'condition': condition})
    tables['monster_actions'].append({'id': monster + '.attack', 'monster_id': monster, 'action_kind': 'attack',
                                      'skill_id': '', 'weight': str(100-sum(action[3] for action in actions)), 'condition': 'always'})


def candidate():
    released, _ = bundled()
    if all(f'dungeon.element.{element}' in released.index['dungeons'] for element in ('earth', 'wind', 'fire')) and 'dungeon.element.tidal_shoal' in released.index['dungeons']:
        return released
    tables = deepcopy(water_candidate().tables)
    tiers = []
    for identity in ('equip.sword','equip.axe','equip.bow','equip.dagger','equip.mage_staff'):
        high = identity + '.30'
        original = next(row for row in tables['equipment_templates'] if row['id'] == identity)
        _copy_equipment(tables, identity, high, name='精制' + original['name'], level_min='31', level_max='50')
        tiers.append(high)
    # The existing two harp tiers overlap at level 30. Keep old catalogs intact
    # and use a 10–29 equivalent in these new pools so level 30 has one tier.
    _copy_equipment(tables, 'equip.instrument', 'equip.instrument.element_low', level_max='29')
    old_pool = [row for row in tables['equipment_pools'] if row['pool_id'] == 'pool.moss_cave']
    old_monster = next(row for row in tables['monsters'] if row['id'] == 'monster.tide_priest')
    old_dungeon = next(row for row in tables['dungeons'] if row['id'] == 'dungeon.moss_cave')
    for element, title, low, high, weakness, monsters in CONFIGS:
        dungeon_id, pool_id = f'dungeon.element.{element}', f'pool.element.{element}'
        boss_id = f'monster.element.{element}.{monsters[-1][0]}'
        tables['dungeons'].append({**old_dungeon, 'id': dungeon_id, 'name': title,
            'recommended_level_min': str(low), 'recommended_level_max': str(high), 'boss_id': boss_id,
            'boss_level_min': str(monsters[-1][3]), 'boss_level_max': str(monsters[-1][4]),
            'equipment_level_min': str(low), 'equipment_level_max': str(high)})
        for channel in ('physical', 'magic'):
            base = next(row for row in tables['monster_profiles'] if row['id'] == 'element.water.magic')
            tables['monster_profiles'].append({**base, 'id': f'element.{element}.{channel}', 'damage_type': channel,
                'evasion': '.08' if element == 'wind' else '.04', 'speed_multiplier': '1.1' if element == 'wind' else '1'})
        source_rows = [{**row, 'equipment_id': 'equip.instrument.element_low'}
                       if row['equipment_id'] == 'equip.instrument' else row for row in old_pool]
        source_rows += [{'id': f'{pool_id}.{identity}', 'pool_id': pool_id, 'equipment_id': identity, 'weight': '1'} for identity in tiers]
        templates = {row['id']: row for row in tables['equipment_templates']}
        for source in source_rows:
            template = templates[source['equipment_id']]
            entry = {**source, 'id': f'{pool_id}.{template["id"]}', 'pool_id': pool_id}
            if (template['slot'] == 'weapon' and template['equipment_type'] != 'generic' and
                    int(template['level_min']) <= high and int(template['level_max']) >= low):
                variant = template['id'] + '.element.' + element
                kind = template['equipment_type']
                power = '.08' if kind == 'two_handed_staff' else '.05' if kind in {'mage_staff', 'holy_staff'} else ''
                _copy_equipment(tables, template['id'], variant, name={'earth':'琥岩','wind':'岚羽','fire':'熔羽'}[element] + template['name'],
                                element=element, element_power=power)
                entry['variant_group'] = element + '.' + template['id']
                tables['equipment_pools'].append({**entry, 'id': entry['id'] + '.variant', 'equipment_id': variant})
            tables['equipment_pools'].append(entry)
        for index, (key, name, rank, min_level, max_level, channel, actions) in enumerate(monsters):
            identity = f'monster.element.{element}.{key}'
            tables['monsters'].append({**old_monster, 'id': identity, 'name': name, 'rank': rank,
                'profile': f'element.{element}.{channel}', 'level_min': str(min_level), 'level_max': str(max_level),
                'attack_multiplier': '1', 'element': element})
            _skills(tables, element, identity, actions)
            resist, weak = {'normal': ('.15', '-.10'), 'elite': ('.20', '-.15'), 'boss': ('.25', '-.20')}[rank]
            for attribute, value in ((element, resist), (weakness, weak)):
                tables['monster_resists'].append({'id': identity + '.' + attribute, 'monster_id': identity, 'element': attribute, 'value': value})
            if rank != 'boss':
                tables['dungeon_monsters'].append({'id': dungeon_id + '.' + key, 'dungeon_id': dungeon_id,
                    'monster_id': identity, 'level_min': str(min_level), 'level_max': str(max_level),
                    'encounter_weight': str((60,35,5)[index]), 'drop_table_id': 'drop.' + identity.removeprefix('monster.'), 'enabled': '1'})
            material_id = f'material.element.{element}.{key}'
            tables['materials'].append({'id': material_id, 'name': MATERIAL_NAMES[key], 'level': str(min_level),
                'sale_price': str(Decimal('1') + Decimal('.04') * min_level), 'enabled': '1'})
            for kind, item in (('material', material_id), ('equipment_pool', pool_id)):
                tables['drops'].append({'id': identity + '.' + kind, 'monster_id': identity, 'item_kind': kind,
                                        'item_id': item, 'weight': '1', 'quantity_min': '1', 'quantity_max': '2' if kind == 'material' else '1'})
        boss_item = 'equip.boss.element.' + element
        _copy_equipment(tables, 'equip.boss.moss_cave', boss_item, name=title + '吊坠', level_min=str(monsters[-1][3]))
        tables['boss_drops'].append({'id': dungeon_id + '.trophy', 'monster_id': boss_id,
                                     'equipment_id': boss_item, 'exclusive_probability': '.5'})
    # Apply the released catalog's modern invariants as well as the new
    # opt-in element checks; the candidate itself remains unpublished.
    validate_tables(tables, expected_player_skills=98, expected_promotion_level=50,
                    catalog_version='combat-1.0.35')
    return Catalog(tables, 'element-all-candidate')


if __name__ == '__main__':
    catalog = candidate()
    print(f'Validated isolated candidate: {len(catalog.tables["dungeons"])} dungeons, '
          f'{len(catalog.tables["monsters"])} monsters, {len(catalog.tables["equipment_templates"])} equipment templates')
