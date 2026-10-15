"""Validate the executable CSV bundle without importing Django or modifying business data."""
from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_CEILING
from pathlib import Path

DIRECTORY = Path(__file__).resolve().parent / 'data'
SLOTS = {'weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'accessory'}
EQUIPMENT_TYPES = {'cloth_armor', 'heavy_armor', 'leather_armor', 'light_armor', 'plate_armor',
                   'magic_shield', 'small_shield', 'large_shield', 'mage_staff', 'two_handed_staff', 'holy_staff',
                   'long_sword', 'axe', 'bow', 'dagger', 'two_handed_sword', 'ring', 'pendant', 'generic'}
AFFIX_ALLOWED_SLOTS = {
    **{stat: SLOTS for stat in ('strength','dexterity','intelligence','vitality','spirit','luck','hp_max','mp_max','healing')},
    'physical_attack': {'weapon','accessory'}, 'magic_attack': {'weapon','accessory'},
    'physical_defense': {'offhand','head','body','hands','feet','accessory'},
    'magic_defense': {'offhand','head','body','hands','feet','accessory'},
    'critical': {'accessory'}, 'critical_damage': {'accessory'},
    'accuracy': {'hands'}, 'evasion': {'feet'},
}
MASTERY_EQUIPMENT_TYPES = {'cloth_armor','heavy_armor','leather_armor','light_armor','plate_armor',
                           'magic_shield','small_shield','large_shield','two_handed_staff','holy_staff','two_handed_sword'}
EFFECTS = {
    'damage', 'heal', 'shield', 'shield_break', 'summon', 'dot', 'hot', 'modifier', 'attack_accuracy',
    'attack_critical', 'attack_penetration', 'missing_hp_damage', 'shared_hit',
    'passive_percent', 'passive_flat', 'passive_cost', 'passive_conversion', 'passive_recovery',
    'passive_low_hp', 'passive_damage', 'passive_duration', 'passive_equipment_percent',
    'passive_equipment_flat', 'reflect',
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


def validate(directory: Path = DIRECTORY, *, expected_status: str = 'released') -> dict[str, list[dict]]:
    manifest = json.loads((directory / 'manifest.json').read_text())
    require(manifest['status'] == expected_status, 'Unexpected release status')
    require(manifest['engine_schema'] == 5, 'Unknown schema')
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

    # Promotion gates are catalog-versioned: historical catalogs keep their
    # original level-70 third promotion while combat-1.0.10 starts it at 50.
    promotion_level = 50 if manifest['version'] in {'combat-1.0.10','combat-1.0.11','combat-1.0.12','combat-1.0.13','combat-1.0.14','combat-1.0.15','combat-1.0.16'} else 70
    expected_skills = 74 if manifest['version'] in {'combat-1.0.13','combat-1.0.14','combat-1.0.15','combat-1.0.16'} else 73 if manifest['version'] in {'combat-1.0.11','combat-1.0.12'} else 71
    return validate_tables(tables, expected_player_skills=expected_skills,
                           expected_promotion_level=promotion_level, catalog_version=manifest['version'])


def validate_tables(tables, *, expected_player_skills: int | None = None,
                    expected_promotion_level: int = 70, catalog_version: str = ''):
    indexes = {name: {r['id']: r for r in rows} for name, rows in tables.items()}
    modern_equipment_rules = catalog_version in {'combat-1.0.11','combat-1.0.12','combat-1.0.13','combat-1.0.14','combat-1.0.15','combat-1.0.16'}

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
        promotion_levels = (1, 10, 30, expected_promotion_level)
        require(int(job['required_level']) == promotion_levels[stage], f'Promotion level: {job["id"]}')
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
        if row['code'] == 'summon':
            require(row['target'] == 'enemy' and row['damage_type'] in {'physical', 'magic'} and bool(row['group']), 'Invalid summon effect')
        if row['code'] == 'shield_break':
            require(row['target'] == 'self' and bool(row['group']), 'Invalid shield-break effect')
            require(any(peer['skill_level_id'] == row['skill_level_id'] and peer['code'] == 'shield' and
                        peer['target'] == row['target'] and peer['group'] == row['group']
                        for peer in tables['skill_effects']), 'Shield-break effect has no matching shield')
        if row['code'] == 'reflect':
            require(row['target'] == 'self' and bool(row['group']) and int(row['duration']) > 0,
                    'Invalid reflection status')
        if row['code'] == 'passive_recovery':
            require(row['target'] == 'self' and row['stat'] in {'hp_max', 'mp_max'} and
                    0 < number(row, 'value') <= 1 and int(row['duration']) == 0,
                    'Invalid passive recovery')
        if row['code'] in {'passive_equipment_percent', 'passive_equipment_flat'}:
            require(row['target'] == 'self' and row['group'] in EQUIPMENT_TYPES,
                    'Invalid equipment mastery condition')
    players = [r for r in tables['skills'] if r['kind'] != 'monster']
    if expected_player_skills is not None:
        require(len(players) == expected_player_skills, 'Player skill count')
    else:
        # Synced profiles retain immutable catalogs used by older exploration facts.
        require(len(players) in {60, 71, 73, 74}, 'Unsupported historical player skill count')
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
        require(number(monster,'attack_multiplier')>0,'Invalid monster attack multiplier')
        require(1 <= int(monster['level_min']) <= int(monster['level_max']) <= 99, 'Monster level range')
        require(any(a['action_kind'] == 'attack' for a in actions[monster['id']]), 'No fallback attack')
        require(math.isclose(sum(number(a, 'weight') for a in actions[monster['id']]), 100), 'Monster weights sum')
    for dungeon in tables['dungeons']:
        require(1<=int(dungeon['equipment_level_min'])<=int(dungeon['equipment_level_max'])<=99,'Equipment pool level range')
        if dungeon['enabled']=='1':require(any(r['dungeon_id']==dungeon['id'] and r['enabled']=='1' and indexes['monsters'][r['monster_id']]['enabled']=='1' for r in tables['dungeon_monsters']),'Enabled dungeon without monsters')
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
        stat = indexes['affixes'][row['affix_id']]['stat']
        if modern_equipment_rules:
            require(slot in AFFIX_ALLOWED_SLOTS[stat], 'Affix is not eligible for equipment slot')
    for row in tables['affix_slots']:
        stat = indexes['affixes'][row['affix_id']]['stat']
        if modern_equipment_rules:
            require(row['slot'] in AFFIX_ALLOWED_SLOTS[stat], 'Affix slot policy mismatch')
    for row in tables['equipment_templates']:
        require(row['slot'] in SLOTS, 'Equipment slot')
        require(1 <= int(row['level_min']) <= int(row['level_max']) <= 99, 'Equipment level')
        require(len(allowed_affixes[row['id']]) >= 3, 'Cannot generate gold gear')
        equipment_type = row.get('equipment_type', '')
        require(not equipment_type or equipment_type in EQUIPMENT_TYPES, 'Equipment type')
        grip = row.get('grip', '')
        require(grip in {'', 'one_handed', 'two_handed'}, 'Equipment grip')
        if grip:
            require(row['slot'] == 'weapon', 'Weapon grip on non-weapon')
        if equipment_type.endswith('_armor'):
            require(row['slot'] in {'body', 'hands', 'feet'}, 'Armor type on non-armor slot')
        if equipment_type in {'magic_shield', 'small_shield', 'large_shield'}:
            require(row['slot'] == 'offhand', 'Shield type on non-offhand slot')
        if equipment_type in {'mage_staff', 'two_handed_staff', 'holy_staff','long_sword','axe','bow','dagger','two_handed_sword'}:
            require(row['slot'] == 'weapon', 'Staff type on non-weapon slot')
        required_mastery = [value for value in row.get('required_mastery', '').split(';') if value]
        require(all(identity in indexes['skills'] and indexes['skills'][identity]['kind'] == 'passive'
                    for identity in required_mastery), 'Unknown equipment mastery')
        if equipment_type in MASTERY_EQUIPMENT_TYPES:
            require(required_mastery, 'Typed equipment has no mastery requirement')
        if equipment_type in {'mage_staff','long_sword','axe','bow','dagger'}:
            require(row['slot'] == 'weapon' and not required_mastery, 'Weapon type classification')
        if equipment_type == 'mage_staff':
            require(grip == 'one_handed' and not required_mastery, 'Mage staff classification')
        if equipment_type == 'two_handed_staff':
            require(grip == 'two_handed', 'Two-handed staff grip')
        if equipment_type == 'holy_staff':
            require(grip == 'one_handed', 'Holy staff grip')
        if equipment_type == 'two_handed_sword':
            require(row['slot'] == 'weapon' and grip == 'two_handed' and row['level_min'] == '50' and row['level_max'] == '70', 'Two-handed sword definition')
            require(required_mastery == ['skill.player.072','skill.player.073'], 'Two-handed sword mastery routes')
        if equipment_type in {'ring','pendant'}:
            require(row['slot'] == 'accessory' and not required_mastery, 'Accessory type classification')
        if modern_equipment_rules:
            eligible_affixes={affix['id'] for affix in tables['affixes'] if row['slot'] in AFFIX_ALLOWED_SLOTS[affix['stat']]}
            require(allowed_affixes[row['id']]==eligible_affixes, 'Equipment affix pool must match its slot policy')
    if modern_equipment_rules:
        require((indexes['equipment_templates']['equip.charm']['level_min'],indexes['equipment_templates']['equip.charm']['level_max'])==('10','30'), 'Pendant level range')
        require((indexes['equipment_templates']['equip.ring']['level_min'],indexes['equipment_templates']['equip.ring']['level_max'])==('1','30'), 'Ring level range')
    if modern_equipment_rules:
        permission_map=defaultdict(set)
        for row in tables['equipment_professions']:
            permission_map[row['equipment_id']].add(row['profession_id'])
        jobs_by_root=defaultdict(set)
        for job in jobs.values():
            cursor=job
            while cursor['parent_id'] and cursor['parent_id'] != 'job.novice':
                cursor=jobs[cursor['parent_id']]
            jobs_by_root[cursor['id']].add(job['id'])
        require(permission_map['equip.training_sword']==set(jobs), 'Training sword must be universal')
        require(permission_map['equip.sword']==jobs_by_root['job.warrior'], 'Long sword must stay on warrior lineage')
        require(permission_map['equip.axe']==jobs_by_root['job.warrior'], 'Axe must stay on warrior lineage')
        require(permission_map['equip.bow'] <= jobs_by_root['job.ranger'] and 'job.novice' not in permission_map['equip.bow'], 'Bow profession restriction')
        require(permission_map['equip.dagger'] <= jobs_by_root['job.ranger'] and 'job.novice' not in permission_map['equip.dagger'], 'Dagger profession restriction')
        if catalog_version == 'combat-1.0.11':
            require(permission_map['equip.two_handed_sword']=={'job.swordmaster','job.berserker'}, 'Historical two-handed sword permission map')
        elif catalog_version in {'combat-1.0.12', 'combat-1.0.13', 'combat-1.0.14', 'combat-1.0.15', 'combat-1.0.16'}:
            for equipment in tables['equipment_templates']:
                mastery_ids=[identity for identity in equipment.get('required_mastery','').split(';') if identity]
                if not mastery_ids:
                    continue
                mastery_jobs={indexes['skills'][identity]['profession_id'] for identity in mastery_ids}
                eligible=set()
                for job_id in jobs:
                    cursor=jobs[job_id]
                    while cursor:
                        if cursor['id'] in mastery_jobs:
                            eligible.add(job_id)
                            break
                        cursor=jobs[cursor['parent_id']] if cursor['parent_id'] else None
                require(permission_map[equipment['id']]==eligible,
                        f"{equipment['id']} permissions must follow learned mastery inheritance")
            require('job.swordsman' in permission_map['equip.two_handed_sword'],
                    'Swordsman with mastery may wear two-handed sword')
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
