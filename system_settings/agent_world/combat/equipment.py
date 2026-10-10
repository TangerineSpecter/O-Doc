"""Instance generation and wearing permissions are independent of inventory storage."""
import math
from decimal import Decimal
from .catalog import Catalog, numeric, cash


def allowed(catalog: Catalog, template_id: str, job: str, level: int, actual_level: int) -> bool:
    return catalog.row('equipment_templates',template_id)['enabled']=='1' and actual_level <= level and any(r['equipment_id'] == template_id and r['profession_id'] == job for r in catalog.tables['equipment_professions'])


def generate(catalog: Catalog, template_id: str, level: int, quality: str, rng, *, starter: bool = False) -> dict:
    template = catalog.row('equipment_templates', template_id)
    if not int(template['level_min']) <= level <= int(template['level_max']):
        raise ValueError('装备等级超出模板范围')
    stats = {}
    for stat in ('physical_attack', 'magic_attack', 'hp', 'mp', 'physical_defense', 'magic_defense', 'healing'):
        value = math.floor(numeric(template, stat + '_base') + numeric(template, stat + '_growth') * level)
        if value:
            stats[{'hp': 'hp_max', 'mp': 'mp_max'}.get(stat, stat)] = value
    if numeric(template, 'evasion'):
        stats['evasion'] = numeric(template, 'evasion')
    pool = [r for r in catalog.tables['equipment_affixes'] if r['equipment_id'] == template_id]
    affixes, positions = [], []
    for _ in range(int(catalog.row('qualities', quality)['affix_count'])):
        row = rng.choices(pool, weights=[numeric(r, 'weight') for r in pool])[0]
        pool = [p for p in pool if p['affix_id'] != row['affix_id']]
        definition = catalog.row('affixes', row['affix_id'])
        low = numeric(definition, 'min_base') + math.ceil(numeric(definition, 'min_growth') * level)
        high = numeric(definition, 'max_base') + math.ceil(numeric(definition, 'max_growth') * level)
        value = rng.randint(int(low), int(high)) if definition['unit'] == 'integer' else rng.randint(round(low * 10000), round(high * 10000)) / 10000
        affixes.append({'id': definition['id'], 'stat': definition['stat'], 'value': value, 'min': low, 'max': high})
        positions.append((value - low) / (high - low) if high > low else 0)
        stats[definition['stat']] = stats.get(definition['stat'], 0) + value
    if starter:
        # Bound promotion weapons have a deterministic primary affix and zero sale value.
        primary = 'spirit' if template_id == 'equip.holy_staff' else 'intelligence' if template_id == 'equip.staff' else 'dexterity' if template_id in ('equip.bow', 'equip.dagger') else 'strength'
        stats = {k: v - sum(a['value'] for a in affixes if a['stat'] == k) for k, v in stats.items()}
        stats[primary] = stats.get(primary, 0) + 1
        affixes = [{'id': 'affix.' + primary, 'stat': primary, 'value': 1, 'min': 1, 'max': 1}]
    value = cash((Decimal(10) + Decimal('.5') * level) * Decimal(catalog.row('qualities', quality)['sale_multiplier']) * (1 + Decimal('.1') * Decimal(str(sum(positions) / len(positions)))))
    return {'template_id': template_id, 'name': '训练木剑' if starter and level == 1 else template['name'], 'slot': template['slot'],
            'level': level, 'quality': quality, 'stats': stats, 'affixes': affixes, 'value': str(0 if starter else value)}
