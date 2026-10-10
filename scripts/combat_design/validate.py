"""Validate the design CSV bundle without importing Django or modifying business data."""
from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_CEILING
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parents[2] / 'docs/data/combat'
SLOTS = {'weapon', 'head', 'body', 'hands', 'feet', 'accessory'}
EFFECTS = {
    'damage', 'heal', 'shield', 'dot', 'hot', 'modifier', 'attack_accuracy',
    'attack_critical', 'attack_penetration', 'missing_hp_damage', 'shared_hit',
    'passive_percent', 'passive_flat', 'passive_cost', 'passive_conversion',
    'passive_low_hp', 'passive_damage', 'passive_duration',
}
EFFECT_STATS = {
    '', 'accuracy', 'attack', 'burn', 'contract', 'critical', 'critical_damage',
    'damage_taken', 'debuff', 'defense', 'dexterity', 'elite_boss', 'evasion',
    'healing', 'hp_max', 'magic_attack', 'magic_defense', 'mp', 'mp_max',
    'physical_attack', 'physical_defense', 'poison', 'reduction', 'spirit',
    'spirit_to_magic', 'strength_to_magic', 'weapon_attack',
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def number(row: dict, field: str) -> float:
    value = float(row[field])
    require(math.isfinite(value), f'non-finite {field}: {row}')
    return value


def validate(directory: Path = DIRECTORY) -> dict[str, list[dict]]:
    manifest = json.loads((directory / 'manifest.json').read_text())
    require(manifest['status'] == 'design_only', 'Unexpected release status')
    require(manifest['engine_schema'] == 1, 'Unknown schema')
    require(set(manifest['files']) == {p.name for p in directory.glob('*.csv')}, 'Unlisted or missing CSV')
    tables = {}
    for name, info in manifest['files'].items():
        path = directory / name
        require(hashlib.sha256(path.read_bytes()).hexdigest() == info['sha256'], f'Hash mismatch: {name}')
        with path.open(encoding='utf-8', newline='') as stream:
            reader = csv.DictReader(stream)
            rows = list(reader)
            require(len(reader.fieldnames) == len(set(reader.fieldnames)), f'Duplicate columns: {name}')
        require(len(rows) == info['rows'], f'Row count: {name}')
        require(all(None not in r and None not in r.values() for r in rows), f'Malformed row: {name}')
        require(len({r['id'] for r in rows}) == len(rows), f'Duplicate ID: {name}')
        require(all(r['id'] for r in rows), f'Empty ID: {name}')
        for row in rows:
            if 'enabled' in row:
                require(row['enabled'] in {'0', '1'}, f'Invalid enabled: {name}')
        tables[path.stem] = rows

    indexes = {name: {r['id']: r for r in rows} for name, rows in tables.items()}

    def reference(table: str, field: str, target: str, optional: bool = False) -> None:
        for row in tables[table]:
            require((optional and not row[field]) or row[field] in indexes[target],
                    f'Broken {table}.{field}: {row["id"]}')

    for table, field, target, optional in [
        ('professions', 'parent_id', 'professions', True), ('skills', 'profession_id', 'professions', True),
        ('skill_levels', 'skill_id', 'skills', False), ('skill_effects', 'skill_level_id', 'skill_levels', False),
        ('dungeons', 'boss_id', 'monsters', False), ('monsters', 'profile', 'monster_profiles', False),
        ('monsters', 'rank', 'monster_ranks', False), ('dungeon_monsters', 'dungeon_id', 'dungeons', False),
        ('dungeon_monsters', 'monster_id', 'monsters', False), ('monster_actions', 'monster_id', 'monsters', False),
        ('monster_actions', 'skill_id', 'skills', True), ('drops', 'monster_id', 'monsters', False),
        ('boss_drops', 'monster_id', 'monsters', False), ('boss_drops', 'equipment_id', 'equipment_templates', False),
        ('affix_slots', 'affix_id', 'affixes', False), ('equipment_professions', 'equipment_id', 'equipment_templates', False),
        ('equipment_professions', 'profession_id', 'professions', False), ('equipment_affixes', 'equipment_id', 'equipment_templates', False),
        ('equipment_affixes', 'affix_id', 'affixes', False), ('equipment_pools', 'equipment_id', 'equipment_templates', False),
    ]:
        reference(table, field, target, optional)

    jobs = indexes['professions']
    require(Counter(int(r['stage']) for r in jobs.values()) == {0: 1, 1: 4, 2: 8, 3: 16}, 'Profession tree cardinality')
    for job in jobs.values():
        stage = int(job['stage'])
        require(int(job['required_level']) == (1, 10, 30, 70)[stage], f'Promotion level: {job["id"]}')
        seen = set()
        cursor = job
        while cursor['parent_id']:
            require(cursor['id'] not in seen, 'Profession cycle')
            seen.add(cursor['id'])
            parent = jobs[cursor['parent_id']]
            require(int(parent['stage']) + 1 == int(cursor['stage']), 'Skipped profession stage')
            cursor = parent
        require(cursor['id'] == 'job.novice', 'Unexpected root')
        require(sum(number(job, s + '_growth') for s in ('strength', 'dexterity', 'intelligence', 'vitality', 'spirit', 'luck')) == (12, 12, 16, 20)[stage], 'Growth total')
        require(number(job, 'hp_growth') > 0 and number(job, 'mp_growth') > 0, 'No HP/MP growth')

    ranks = defaultdict(list)
    effects = defaultdict(list)
    for row in tables['skill_levels']:
        ranks[row['skill_id']].append(row)
        require(1 <= int(row['required_level']) <= 99, 'Skill level range')
        require(number(row, 'cost_base') >= 0 and number(row, 'cost_per_level') >= 0, 'Negative MP cost')
    for row in tables['skill_effects']:
        effects[row['skill_level_id']].append(row)
        require(row['code'] in EFFECTS, f'Unsupported effect: {row["code"]}')
        require(row['stat'] in EFFECT_STATS, f'Unsupported scaling stat: {row["stat"]}')
        require(row['target'] in {'self', 'enemy'}, 'Invalid target')
        require(row['damage_type'] in {'', 'physical', 'magic'}, 'Invalid damage type')
        require(0 <= number(row, 'chance') <= 1, 'Invalid effect chance')
        require(int(row['hits']) >= 1 and int(row['duration']) >= 0, 'Invalid hit/duration')
        number(row, 'value')
    players = [r for r in tables['skills'] if r['kind'] != 'monster']
    require(len(players) == 60, 'Player skill count')
    for skill in tables['skills']:
        require(skill['kind'] in {'active', 'passive', 'monster'}, 'Skill kind')
        ordered = sorted(ranks[skill['id']], key=lambda r: int(r['rank']))
        count = 1 if skill['kind'] == 'monster' else 3
        require([int(r['rank']) for r in ordered] == list(range(1, count + 1)), 'Missing rank')
        require([int(r['required_level']) for r in ordered] == [min(99, int(skill['learn_level']) + 10 * i) for i in range(count)], 'Skill growth schedule')
        if skill['kind'] != 'monster':
            require(int(skill['learn_level']) >= int(jobs[skill['profession_id']]['required_level']), 'Learn before promotion')
        else:
            require(not skill['profession_id'], 'Monster skill assigned to player profession')
        for rank in ordered:
            require(effects[rank['id']], f'Missing effects: {rank["id"]}')
            if skill['kind'] == 'passive':
                require(all(e['code'].startswith('passive_') for e in effects[rank['id']]), 'Passive effect mismatch')
            else:
                require(int(rank['cooldown_rounds']) >= 1, 'No active cooldown')

    actions = defaultdict(list)
    for row in tables['monster_actions']:
        actions[row['monster_id']].append(row)
        require(number(row, 'weight') > 0, 'Action weight')
        require(row['condition'] in {'always', 'hp_below_50', 'not_active'}, 'Unknown condition')
        require(row['action_kind'] in {'attack', 'skill'}, 'Unknown action')
        require(bool(row['skill_id']) == (row['action_kind'] == 'skill'), 'Action skill mismatch')
        if row['skill_id']:
            require(indexes['skills'][row['skill_id']]['kind'] == 'monster', 'Player skill on monster')
    for monster in tables['monsters']:
        require(1 <= int(monster['level_min']) <= int(monster['level_max']) <= 99, 'Monster level range')
        require(any(a['action_kind'] == 'attack' for a in actions[monster['id']]), 'No fallback attack')
        require(math.isclose(sum(number(a, 'weight') for a in actions[monster['id']]), 100), 'Monster weights sum')
    for dungeon in tables['dungeons']:
        boss = indexes['monsters'][dungeon['boss_id']]
        require(boss['rank'] == 'boss', 'Dungeon boss rank')
        require((boss['level_min'], boss['level_max']) == (dungeon['boss_level_min'], dungeon['boss_level_max']), 'Boss level mismatch')
        require(0 < number(dungeon, 'boss_probability_step') <= number(dungeon, 'boss_probability_cap') <= 1, 'Boss probability')
    for row in tables['dungeon_monsters']:
        monster = indexes['monsters'][row['monster_id']]
        require(monster['rank'] != 'boss', 'Boss in ordinary pool')
        require(int(monster['level_min']) <= int(row['level_min']) <= int(row['level_max']) <= int(monster['level_max']), 'Encounter range')
        require(row['drop_table_id'] == 'drop.' + monster['id'].removeprefix('monster.'), 'Drop table alias')
        require(number(row, 'encounter_weight') > 0, 'Encounter weight')

    pools = {r['pool_id'] for r in tables['equipment_pools']}
    for row in tables['drops']:
        require(row['item_kind'] in {'material', 'equipment_pool'}, 'Drop kind')
        require(row['item_id'] in (indexes['materials'] if row['item_kind'] == 'material' else pools), 'Drop item missing')
        require(1 <= int(row['quantity_min']) <= int(row['quantity_max']) <= 2, 'Drop quantity')
        require(number(row, 'weight') > 0, 'Drop weight')
    require({r['monster_id'] for r in tables['drops']} == set(indexes['monsters']), 'Monster without drops')
    for row in tables['materials']:
        require(Decimal(row['sale_price']) == Decimal(1) + Decimal('.04') * int(row['level']), 'Material price')
    allowed_affixes = defaultdict(set)
    for row in tables['equipment_affixes']:
        allowed_affixes[row['equipment_id']].add(row['affix_id'])
        require(number(row, 'weight') > 0, 'Affix weight')
        slot = indexes['equipment_templates'][row['equipment_id']]['slot']
        require(any(a['affix_id'] == row['affix_id'] and a['slot'] == slot for a in tables['affix_slots']), 'Wrong affix slot')
    for row in tables['equipment_templates']:
        require(row['slot'] in SLOTS, 'Equipment slot')
        require(1 <= int(row['level_min']) <= int(row['level_max']) <= 99, 'Equipment level')
        require(len(allowed_affixes[row['id']]) >= 3, 'Cannot generate gold gear')
    for row in tables['boss_drops']:
        require(indexes['monsters'][row['monster_id']]['rank'] == 'boss', 'Exclusive drop on normal monster')
        require(indexes['equipment_templates'][row['equipment_id']]['boss_only'] == '1', 'Exclusive gear flag')
        require(0 <= number(row, 'exclusive_probability') <= 1, 'Exclusive probability')
    require(all(indexes['equipment_templates'][r['equipment_id']]['boss_only'] == '0' for r in tables['equipment_pools']), 'Boss gear in general pool')
    for row in tables['affixes']:
        require(row['unit'] in {'integer', 'ratio'}, 'Affix unit')
        for level in (1, 99):
            require(number(row, 'min_base') + number(row, 'min_growth') * level <= number(row, 'max_base') + number(row, 'max_growth') * level, 'Affix range')
    for rank in ('normal', 'elite', 'boss'):
        require(math.isclose(sum(number(q, rank + '_weight') for q in tables['qualities']), 1), 'Quality weights')
    require({r['id']: int(r['affix_count']) for r in tables['qualities']} == {'white': 1, 'blue': 2, 'gold': 3}, 'Quality affix counts')
    for row in tables['potions']:
        require(row['kind'] in {'heal', 'mana'}, 'Potion kind')
        require(number(row, 'restore_value') > 0 and number(row, 'purchase_price') > 0, 'Potion values')
        require(int(row['shared_cooldown_rounds']) == 2, 'Potion cooldown')
    for row in tables['styles']:
        require(number(row, 'attack_weight') > 0 and number(row, 'skill_weight') > 0, 'Style fallback')
        require(0 < number(row, 'heal_threshold') <= 1 and 0 < number(row, 'mana_threshold') <= 1, 'Style threshold')
    rules = {r['id']: number(r, 'value') for r in tables['rules']}
    require(rules['level_cap'] == 99 and rules['loot_carry_cap'] == 2 and rules['equipment_carry_cap'] == 1, 'Rule caps')
    for key in ('round_seconds', 'encounter_delay_seconds', 'loot_interval_seconds', 'equipment_interval_seconds', 'daily_minutes'):
        require(rules[key] > 0, f'Invalid interval: {key}')
    require(rules['hit_min'] <= rules['hit_max'] <= 1, 'Hit caps')
    require(-1 < rules['attribute_percent_bonus_min'] <= rules['attribute_percent_bonus_max'], 'Attribute caps')
    for rank in ('normal', 'elite', 'boss'):
        require(rules[rank + '_gold_chance'] == number(indexes['qualities']['gold'], rank + '_weight'), 'Duplicated quality parameter mismatch')
    require(len(tables['level_experience']) == 99, 'Missing XP levels')
    for level, row in enumerate(tables['level_experience'], 1):
        expected = int((Decimal(200) + 20 * level ** 2 + Decimal('1.6') * level ** 3).to_integral_value(rounding=ROUND_CEILING)) if level < 99 else 0
        require(int(row['level']) == level and int(row['experience_to_next']) == expected, 'XP curve mismatch')
    return tables


if __name__ == '__main__':
    result = validate()
    print(json.dumps({'status': 'valid_design_only', 'tables': len(result), 'rows': sum(map(len, result.values()))}))
