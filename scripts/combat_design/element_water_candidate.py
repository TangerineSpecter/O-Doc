"""Build a water-dungeon candidate in memory for validation and simulation only.

Never installs a catalog; image and balance acceptance must precede a release.
"""
from copy import deepcopy
from decimal import Decimal
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from system_settings.agent_world.combat.catalog import Catalog, bundled
from system_settings.agent_world.combat.catalog_validation import validate_tables
from scripts.combat_design.evaluate_element_water_draft import BOSS, CRAB, DUNGEON, GUARD, SPIRIT, draft_catalog


RENAME = {
    BOSS: 'monster.element.water.tide_crown', CRAB: 'monster.element.water.bubble_crab',
    SPIRIT: 'monster.element.water.little_spirit', GUARD: 'monster.element.water.reef_guard',
    DUNGEON: 'dungeon.element.tidal_shoal',
    'draft.water_magic': 'element.water.magic', 'draft.water_physical': 'element.water.physical',
    'skill.monster.draft.': 'skill.monster.element.water.',
}
MATERIALS = {
    RENAME[CRAB]: ('泡泡贝壳', 15), RENAME[SPIRIT]: ('潮汐水珠', 15),
    RENAME[GUARD]: ('珊瑚甲片', 19), RENAME[BOSS]: ('潮冠结晶', 23),
}


def _rename(value):
    if not isinstance(value, str):
        return value
    for before, after in sorted(RENAME.items(), key=lambda x: len(x[0]), reverse=True):
        value = value.replace(before, after)
    return value


def _copy_equipment(tables, source, identity, **changes):
    template = next(row for row in tables['equipment_templates'] if row['id'] == source)
    tables['equipment_templates'].append({**template, **changes, 'id': identity})
    for table in ('equipment_affixes', 'equipment_professions'):
        originals = [row for row in tables[table] if row['equipment_id'] == source]
        for row in originals:
            tables[table].append({**row, 'id': row['id'].replace(source, identity, 1), 'equipment_id': identity})


def candidate():
    released, _ = bundled()
    if 'dungeon.element.tidal_shoal' in released.index['dungeons']:
        return released
    tables = deepcopy(draft_catalog().tables)
    for rows in tables.values():
        for row in rows:
            for key, value in row.items():
                row[key] = _rename(value)
    for row in tables['dungeon_monsters']:
        if row['dungeon_id'] == RENAME[DUNGEON]:
            row['drop_table_id'] = 'drop.' + row['monster_id'].removeprefix('monster.')
    dungeon_id = RENAME[DUNGEON]
    pool_id = 'pool.element.tidal_shoal'
    weapons = {'long_sword', 'axe', 'bow', 'dagger', 'mage_staff', 'instrument'}
    # Copy the existing regional category distribution, excluding Boss-only items.
    source_pool = [row for row in tables['equipment_pools'] if row['pool_id'] == 'pool.moss_cave']
    templates = {row['id']: row for row in tables['equipment_templates']}
    water_variants = {}
    for source in source_pool:
        template = templates[source['equipment_id']]
        new_row = {**source, 'id': source['id'].replace('pool.moss_cave.', pool_id + '.', 1),
                   'pool_id': pool_id}
        if template.get('equipment_type') in weapons and int(template['level_min']) <= 25 and int(template['level_max']) >= 15:
            identity = template['id'] + '.element.water'
            if identity not in water_variants:
                kind = template['equipment_type']
                power = '.05' if kind == 'mage_staff' else ''
                _copy_equipment(tables, template['id'], identity, name='潮汐' + template['name'],
                                element='water', element_power=power)
                water_variants[identity] = True
            group = 'water.' + template['id']
            new_row['variant_group'] = group
            tables['equipment_pools'].append({**new_row, 'id': new_row['id'] + '.water',
                                              'equipment_id': identity})
        tables['equipment_pools'].append(new_row)
    for row in tables['drops']:
        if row['monster_id'] not in MATERIALS:
            continue
        if row['item_kind'] == 'equipment_pool':
            row['item_id'] = pool_id
        else:
            name, level = MATERIALS[row['monster_id']]
            material_id = 'material.element.water.' + row['monster_id'].split('.')[-1]
            row['item_id'] = material_id
            tables['materials'].append({'id': material_id, 'name': name, 'level': str(level),
                'sale_price': str(Decimal('1') + Decimal('.04') * level), 'enabled': '1'})
    boss_item = 'equip.boss.element.tidal_shoal'
    _copy_equipment(tables, 'equip.boss.moss_cave', boss_item, name='潮冠吊坠', level_min='23')
    tables['boss_drops'].append({'id': dungeon_id + '.trophy', 'monster_id': RENAME[BOSS],
                                 'equipment_id': boss_item, 'exclusive_probability': '.5'})
    validate_tables(tables, expected_player_skills=98, expected_promotion_level=50)
    return Catalog(tables, 'element-water-candidate')


if __name__ == '__main__':
    catalog = candidate()
    print(f'Validated isolated candidate: {catalog.version}; {len(catalog.tables["monsters"])} monsters, '
          f'{len(catalog.tables["equipment_templates"])} equipment templates')
