"""Instance generation and wearing permissions are independent of inventory storage."""
import math
from decimal import Decimal
from .catalog import Catalog, numeric, cash
from .equipment_names import equipment_name
from .equipment_rolls import QUALITIES, affix_range, quality_base

BASE_STATS = ('physical_attack', 'magic_attack', 'hp', 'mp', 'physical_defense', 'magic_defense', 'healing')


def base_stats(template: dict, level: int, quality: str, *, starter: bool = False) -> dict:
    """Intrinsic stats before rolled affixes; the same budget applies to stored gear."""
    stats = {}
    for stat in BASE_STATS:
        value = math.floor(numeric(template, stat + '_base') + numeric(template, stat + '_growth') * level)
        if not starter:
            value = quality_base(value, quality, level)
        if value:
            stats[{'hp': 'hp_max', 'mp': 'mp_max'}.get(stat, stat)] = value
    if numeric(template, 'evasion'):
        stats['evasion'] = numeric(template, 'evasion')
    # Elemental mastery is an intrinsic ratio, not a quality-scaled affix.
    # Old catalog rows have no such field and therefore retain their old value.
    element = template.get('element') or ''
    element_power = numeric(template, 'element_power')
    if element and element_power:
        stats[f'{element}_power'] = element_power
    return stats


def effective_snapshot(snapshot: dict, catalog: Catalog) -> dict:
    """Recalculate intrinsic stats for existing gear while keeping its rolled affixes.

    Stored snapshots remain frozen for facts, checkpoints and WebDAV. Only read
    projections use this recalibration, so old drops immediately follow the current
    quality curve without rewriting history.
    """
    if not isinstance(snapshot, dict):
        return snapshot
    template_id, level, quality = snapshot.get('template_id'), snapshot.get('level'), snapshot.get('quality')
    template = catalog.index.get('equipment_templates', {}).get(template_id)
    affixes = snapshot.get('affixes')
    if (not isinstance(template_id, str) or not isinstance(template, dict) or type(level) is not int or
            not 1 <= level <= 99 or quality not in QUALITIES or not isinstance(affixes, list) or
            not isinstance(snapshot.get('stats'), dict) or any(
                not isinstance(affix, dict) or not isinstance(affix.get('stat'), str) or
                not isinstance(affix.get('value'), (int, float)) or isinstance(affix.get('value'), bool)
                for affix in affixes)):
        return snapshot
    base = base_stats(template, level, quality)
    rolled = {}
    for affix in affixes:
        stat, value = affix['stat'], affix['value']
        rolled[stat] = rolled.get(stat, 0) + value
    stats = {stat: value for stat, value in snapshot['stats'].items() if stat not in base and stat not in rolled}
    stats.update(rolled)
    for stat, value in base.items():
        stats[stat] = value + rolled.get(stat, 0)
    return {**snapshot, 'stats': stats}


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


def eligibility_template_id(catalog: Catalog, template_id: str, snapshot: dict, *, bound: bool) -> str:
    """Apply current training-sword rules to the immutable legacy starter snapshot."""
    if (template_id == 'equip.sword' and bound and snapshot.get('name') == '训练木剑' and
            snapshot.get('level') == 1 and 'equip.training_sword' in catalog.index['equipment_templates']):
        return 'equip.training_sword'
    return template_id


def promotion_weapon(catalog: Catalog, job: str, level: int) -> str:
    candidates = [r['equipment_id'] for r in catalog.tables['equipment_professions']
                  if r['profession_id'] == job and
                  catalog.row('equipment_templates', r['equipment_id'])['slot'] == 'weapon' and
                  int(catalog.row('equipment_templates', r['equipment_id'])['level_min']) <= level <=
                  int(catalog.row('equipment_templates', r['equipment_id'])['level_max']) and
                  allowed(catalog, r['equipment_id'], job, level, level)]
    if 'job.bard' in catalog.path(job):
        instruments = [sid for sid in candidates if catalog.row('equipment_templates', sid).get('equipment_type') == 'instrument']
        if instruments:
            return max(instruments, key=lambda sid: int(catalog.row('equipment_templates', sid)['level_min']))
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
    stats = base_stats(template, level, quality, starter=starter)
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
        primary = 'spirit' if template_id == 'equip.holy_staff' else 'intelligence' if template_id in ('equip.staff', 'equip.mage_staff') or template.get('equipment_type') == 'instrument' else 'dexterity' if template_id in ('equip.bow', 'equip.dagger') else 'strength'
        stats = {k: v - sum(a['value'] for a in affixes if a['stat'] == k) for k, v in stats.items()}
        stats[primary] = stats.get(primary, 0) + 1
        affixes = [{'id': 'affix.' + primary, 'stat': primary, 'value': 1, 'min': 1, 'max': 1}]
    # Read the frozen catalog so in-flight explorations retain their original prices.
    base_price = (Decimal(catalog.row('rules', 'weapon_sale_base')['value'])
                  + Decimal(catalog.row('rules', 'weapon_sale_per_level')['value']) * level)
    value = cash(base_price * Decimal(catalog.row('qualities', quality)['sale_multiplier'])
                 * (1 + Decimal('.1') * Decimal(str(sum(positions) / len(positions)))))
    item = {'template_id': template_id, 'name': equipment_name(template, affixes, starter=starter, level=level),
            'slot': template['slot'], 'level': level, 'quality': quality, 'stats': stats,
            'affixes': affixes, 'value': str(0 if starter else value)}
    if template.get('equipment_type'):
        item['equipment_type'] = template['equipment_type']
    if template.get('grip'):
        item['grip'] = template['grip']
    if template['slot'] == 'weapon':
        item['element'] = template.get('element') or ''
    return item
