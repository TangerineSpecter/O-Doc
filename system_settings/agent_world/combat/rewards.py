"""Time allowances are resident-scoped, survive restarts and cross-day trips."""
from decimal import Decimal, ROUND_HALF_UP
from random import Random

from . import equipment
from .catalog import Catalog


ZERO = Decimal('0')
HUNDRED = Decimal('100')


def profession_bonus_snapshot(agent) -> dict[str, str]:
    """Freeze enabled life-profession maze bonuses for one exploration."""
    fields = (
        'maze_equipment_drop_bonus_percentage',
        'maze_material_yield_percentage',
        'maze_equipment_interval_reduction_percentage',
        'maze_experience_bonus_percentage',
    )
    profession = agent.profession if agent and agent.profession_id else None
    if profession is None or not profession.enabled:
        return {field: '0' for field in fields}
    return {field: str(getattr(profession, field) or 0) for field in fields}


def _percentage(value, *, cap=None) -> Decimal:
    try:
        percentage = Decimal(str(value or 0))
    except Exception:
        percentage = ZERO
    percentage = max(ZERO, percentage)
    return min(percentage, cap) if cap is not None else percentage


def accrue(
    progress: dict,
    seconds: int,
    day: str,
    *,
    loot_interval_seconds: int = 300,
    equipment_interval_seconds: int = 300,
    equipment_interval_reduction_percentage=0,
) -> None:
    progress['loot_time'] = progress.get('loot_time',0)+seconds
    progress['gear_time'] = progress.get('gear_time',0)+seconds
    loot_interval_seconds = max(1, int(loot_interval_seconds))
    equipment_interval_seconds = max(1, int(equipment_interval_seconds))
    reduction = _percentage(equipment_interval_reduction_percentage, cap=HUNDRED) / HUNDRED
    reduced_interval = int((Decimal(equipment_interval_seconds) * (1 - reduction)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    # Equipment checks have their own cadence; at most one can be pending until a kill.
    effective_gear_interval = max(1, reduced_interval)
    progress['loot'] = min(2,progress.get('loot',0)+progress['loot_time']//loot_interval_seconds)
    progress['gear'] = min(1,progress.get('gear',0)+progress['gear_time']//effective_gear_interval)
    progress['loot_time'] %= loot_interval_seconds
    progress['gear_time'] %= effective_gear_interval
    progress['days'] = {**progress.get('days',{}),day:progress.get('days',{}).get(day,0)+seconds}


def _material_bonus_quantity(progress: dict, material_id: str, base_quantity: int, percentage) -> int:
    bonuses = progress.setdefault('material_yield_remainders', {})
    if not isinstance(bonuses, dict):
        bonuses = progress['material_yield_remainders'] = {}
    try:
        remainder = Decimal(str(bonuses.get(material_id, '0')))
    except Exception:
        remainder = ZERO
    accumulated = Decimal(base_quantity) * _percentage(percentage) / HUNDRED + remainder
    extra = int(accumulated)
    new_remainder = accumulated - extra
    if new_remainder:
        bonuses[material_id] = str(new_remainder)
    else:
        bonuses.pop(material_id, None)
    return extra


def _equipment_level_band(dungeon: dict, template: dict, monster_level: int) -> tuple[int, int] | None:
    """Return the generated item-level range when this encounter can drop a template."""
    template_min = int(template['level_min'])
    template_max = int(template['level_max'])
    if not template_min <= monster_level <= template_max:
        return None
    lower = max(int(dungeon['equipment_level_min']), template_min)
    upper = min(monster_level, int(dungeon['equipment_level_max']), template_max)
    return (lower, upper) if lower <= upper else None


def equipment_pool_weights(pool: list[dict]) -> list[float]:
    """Split a category's original weight only across its currently eligible variants.

    Historical pools have no variant_group, so their sampling is unchanged. A
    group is validated in the catalog; each row carries the category weight.
    """
    counts: dict[str, int] = {}
    for row in pool:
        group = row.get('variant_group') or ''
        if group:
            counts[group] = counts.get(group, 0) + 1
    return [float(row['weight']) / counts[row['variant_group']] if row.get('variant_group')
            else float(row['weight']) for row in pool]


def drops(
    catalog: Catalog,
    monster_id: str,
    level: int,
    progress: dict,
    rng: Random,
    profession_bonuses: dict | None = None,
) -> list[dict]:
    profession_bonuses = profession_bonuses or {}
    equipment_bonus = _percentage(profession_bonuses.get('maze_equipment_drop_bonus_percentage'), cap=HUNDRED)
    material_bonus = _percentage(profession_bonuses.get('maze_material_yield_percentage'))
    template = catalog.row('monsters',monster_id)
    options = [r for r in catalog.tables['drops'] if r['monster_id']==monster_id]
    material = next(r for r in options if r['item_kind']=='material')
    pool_id = next(r['item_id'] for r in options if r['item_kind']=='equipment_pool')
    dungeon=catalog.monster_dungeons[monster_id]
    pool=[]
    for row in catalog.tables['equipment_pools']:
        if row['pool_id'] != pool_id:
            continue
        definition = catalog.row('equipment_templates', row['equipment_id'])
        if definition['enabled'] == '1' and _equipment_level_band(dungeon, definition, level):
            pool.append(row)
    boss = template['rank']=='boss'
    equipment_chance = min(1.0, max(0.0, float(catalog.rules['normal_equipment_chance']) + float(equipment_bonus / HUNDRED)))
    rewards = []
    opportunities = min(progress.get('loot',0),2 if boss else 1)
    has_gear_chance = progress.get('gear',0)>0
    gear = has_gear_chance and bool(pool) and (boss or rng.random()<equipment_chance)
    if has_gear_chance:
        # A missed roll spends the equipment check; material opportunities remain available.
        progress['gear'] -= 1
    if gear:
        trophy = next((r for r in catalog.tables['boss_drops'] if r['monster_id']==monster_id),None)
        trophy_definition = catalog.row('equipment_templates', trophy['equipment_id']) if trophy else None
        trophy_band = _equipment_level_band(dungeon, trophy_definition, level) if trophy_definition and trophy_definition['enabled'] == '1' else None
        if boss and trophy and trophy_band and rng.random()<float(trophy['exclusive_probability']):
            identity = trophy['equipment_id']
        else:
            identity = rng.choices(pool, weights=equipment_pool_weights(pool))[0]['equipment_id']
        quality = rng.choices(catalog.tables['qualities'],weights=[float(r[template['rank']+'_weight']) for r in catalog.tables['qualities']])[0]['id']
        definition=catalog.row('equipment_templates',identity)
        gear_level=rng.randint(*_equipment_level_band(dungeon, definition, level))
        rewards.append({'kind':'equipment','item':equipment.generate(catalog,identity,gear_level,quality,rng)})
    for index in range(opportunities):
        progress['loot'] -= 1
        if gear and index==0:
            # When both opportunities coincide, equipment replaces one material reward.
            continue
        row = catalog.row('materials',material['item_id'])
        base_quantity = rng.randint(int(material['quantity_min']),int(material['quantity_max']))
        bonus_quantity = (
            _material_bonus_quantity(progress, row['id'], base_quantity, material_bonus)
            if material_bonus else 0
        )
        rewards.append({
            'kind': 'material', 'item': row, 'quantity': base_quantity + bonus_quantity,
            'base_quantity': base_quantity, 'profession_bonus_quantity': bonus_quantity,
            'profession_bonus_percentage': str(material_bonus),
        })
    return rewards
