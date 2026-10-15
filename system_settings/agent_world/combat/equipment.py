"""Instance generation and wearing permissions are independent of inventory storage."""
import math
from decimal import Decimal
from .catalog import Catalog, numeric, cash
from .equipment_names import equipment_name
from .equipment_rolls import affix_range, quality_base


def allowed(catalog: Catalog, template_id: str, job: str, level: int, actual_level: int) -> bool:
    template = catalog.row('equipment_templates', template_id)
    if template['enabled'] != '1' or actual_level > level:
        return False
    required_mastery = [value for value in template.get('required_mastery', '').split(';') if value]
    if required_mastery:
        learned = catalog.learned(job, level)
        if any(identity in learned for identity in required_mastery):
            return True
        # Keep the old two-handed staff allowlist only for immutable catalogs
        # released before mastery-only eligibility was corrected in 1.0.12.
        version_prefix = 'combat-1.0.'
        version_suffix = catalog.version.removeprefix(version_prefix)
        is_legacy_catalog = (catalog.version.startswith(version_prefix) and
                             version_suffix.isdigit() and int(version_suffix) < 12)
        return (is_legacy_catalog and template.get('equipment_type') == 'two_handed_staff' and
                any(r['equipment_id'] == template_id and r['profession_id'] == job
                    for r in catalog.tables['equipment_professions']))
    return any(r['equipment_id'] == template_id and r['profession_id'] == job
               for r in catalog.tables['equipment_professions'])


def loadout_slot_matches(catalog: Catalog, template_id: str, snapshot: dict, slot: str) -> bool:
    """Accessory snapshots share one body slot; loadout keys distinguish ring instances."""
    template = catalog.row('equipment_templates', template_id)
    item_slot = snapshot.get('slot')
    equipment_type = snapshot.get('equipment_type') or template.get('equipment_type', '')
    if slot in {'ring_1', 'ring_2'}:
        return item_slot == 'accessory' and equipment_type == 'ring'
    if slot == 'accessory':
        return item_slot == 'accessory' and equipment_type != 'ring'
    return item_slot == slot


def promotion_weapon(catalog: Catalog, job: str, level: int) -> str:
    candidates = [r['equipment_id'] for r in catalog.tables['equipment_professions']
                  if r['profession_id'] == job and
                  catalog.row('equipment_templates', r['equipment_id'])['slot'] == 'weapon' and
                  int(catalog.row('equipment_templates', r['equipment_id'])['level_min']) <= level <=
                  int(catalog.row('equipment_templates', r['equipment_id'])['level_max']) and
                  allowed(catalog, r['equipment_id'], job, level, level)]
    preferred = {'job.mage': 'equip.mage_staff'}.get(job)
    if preferred in candidates:
        return preferred
    if candidates:
        return candidates[0]
    raise ValueError('转职后没有可用武器')


def generate(catalog: Catalog, template_id: str, level: int, quality: str, rng, *, starter: bool = False) -> dict:
    template = catalog.row('equipment_templates', template_id)
    if not int(template['level_min']) <= level <= int(template['level_max']):
        raise ValueError('装备等级超出模板范围')
    stats = {}
    for stat in ('physical_attack', 'magic_attack', 'hp', 'mp', 'physical_defense', 'magic_defense', 'healing'):
        value = math.floor(numeric(template, stat + '_base') + numeric(template, stat + '_growth') * level)
        if not starter:
            value = quality_base(value, quality)
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
        low, high = affix_range(definition, level, quality)
        value = rng.randint(int(low), int(high)) if definition['unit'] == 'integer' else rng.randint(round(low * 10000), round(high * 10000)) / 10000
        affixes.append({'id': definition['id'], 'stat': definition['stat'], 'value': value, 'min': low, 'max': high})
        positions.append((value - low) / (high - low) if high > low else 0)
        stats[definition['stat']] = stats.get(definition['stat'], 0) + value
    if starter:
        # Bound promotion weapons have a deterministic primary affix and zero sale value.
        primary = 'spirit' if template_id == 'equip.holy_staff' else 'intelligence' if template_id in ('equip.staff', 'equip.mage_staff') else 'dexterity' if template_id in ('equip.bow', 'equip.dagger') else 'strength'
        stats = {k: v - sum(a['value'] for a in affixes if a['stat'] == k) for k, v in stats.items()}
        stats[primary] = stats.get(primary, 0) + 1
        affixes = [{'id': 'affix.' + primary, 'stat': primary, 'value': 1, 'min': 1, 'max': 1}]
    value = cash((Decimal(10) + Decimal('.5') * level) * Decimal(catalog.row('qualities', quality)['sale_multiplier']) * (1 + Decimal('.1') * Decimal(str(sum(positions) / len(positions)))))
    item = {'template_id': template_id, 'name': equipment_name(template, affixes, starter=starter, level=level),
            'slot': template['slot'], 'level': level, 'quality': quality, 'stats': stats,
            'affixes': affixes, 'value': str(0 if starter else value)}
    if template.get('equipment_type'):
        item['equipment_type'] = template['equipment_type']
    if template.get('grip'):
        item['grip'] = template['grip']
    return item
