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
    equipment_interval_seconds: int = 1800,
    equipment_interval_reduction_percentage=0,
) -> None:
    progress['loot_time'] = progress.get('loot_time',0)+seconds
    progress['gear_time'] = progress.get('gear_time',0)+seconds
    loot_interval_seconds = max(1, int(loot_interval_seconds))
    equipment_interval_seconds = max(1, int(equipment_interval_seconds))
    reduction = _percentage(equipment_interval_reduction_percentage, cap=HUNDRED) / HUNDRED
    reduced_interval = int((Decimal(equipment_interval_seconds) * (1 - reduction)).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    # No more than one equipment allowance can accrue per ordinary loot allowance.
    effective_gear_interval = max(loot_interval_seconds, reduced_interval)
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
    lower=int(dungeon['equipment_level_min'])
    upper=min(level,int(dungeon['equipment_level_max']))
    pool=[row for row in catalog.tables['equipment_pools'] if row['pool_id']==pool_id and catalog.row('equipment_templates',row['equipment_id'])['enabled']=='1' and int(catalog.row('equipment_templates',row['equipment_id'])['level_min'])<=upper and int(catalog.row('equipment_templates',row['equipment_id'])['level_max'])>=lower]
    boss = template['rank']=='boss'
    equipment_chance = min(1.0, max(0.0, float(catalog.rules['normal_equipment_chance']) + float(equipment_bonus / HUNDRED)))
    rewards = []
    opportunities = min(progress.get('loot',0),2 if boss else 1)
    for index in range(opportunities):
        gear = bool(pool) and progress.get('gear',0)>0 and index==0 and (boss or rng.random()<equipment_chance)
        progress['loot'] -= 1
        if gear:
            progress['gear'] -= 1
            trophy = next((r for r in catalog.tables['boss_drops'] if r['monster_id']==monster_id),None)
            if boss and trophy and catalog.row('equipment_templates',trophy['equipment_id'])['enabled']=='1' and int(catalog.row('equipment_templates',trophy['equipment_id'])['level_min'])<=upper and rng.random()<float(trophy['exclusive_probability']):
                identity = trophy['equipment_id']
            else:
                identity = rng.choices(pool,weights=[float(r['weight']) for r in pool])[0]['equipment_id']
            quality = rng.choices(catalog.tables['qualities'],weights=[float(r[template['rank']+'_weight']) for r in catalog.tables['qualities']])[0]['id']
            definition=catalog.row('equipment_templates',identity)
            gear_level=rng.randint(max(lower,int(definition['level_min'])),min(upper,int(definition['level_max'])))
            rewards.append({'kind':'equipment','item':equipment.generate(catalog,identity,gear_level,quality,rng)})
        else:
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
