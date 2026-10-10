"""Time allowances are resident-scoped, survive restarts and cross-day trips."""
from . import equipment
from .catalog import Catalog
from random import Random


def accrue(progress: dict, seconds: int, day: str) -> None:
    progress['loot_time'] = progress.get('loot_time',0)+seconds
    progress['gear_time'] = progress.get('gear_time',0)+seconds
    progress['loot'] = min(2,progress.get('loot',0)+progress['loot_time']//300)
    progress['gear'] = min(1,progress.get('gear',0)+progress['gear_time']//1800)
    progress['loot_time'] %= 300
    progress['gear_time'] %= 1800
    progress['days'] = {**progress.get('days',{}),day:progress.get('days',{}).get(day,0)+seconds}


def drops(catalog: Catalog, monster_id: str, level: int, progress: dict, rng: Random) -> list[dict]:
    template = catalog.row('monsters',monster_id)
    options = [r for r in catalog.tables['drops'] if r['monster_id']==monster_id]
    material = next(r for r in options if r['item_kind']=='material')
    pool_id = next(r['item_id'] for r in options if r['item_kind']=='equipment_pool')
    dungeon=catalog.monster_dungeons[monster_id]
    lower=int(dungeon['equipment_level_min'])
    upper=min(level,int(dungeon['equipment_level_max']))
    pool=[row for row in catalog.tables['equipment_pools'] if row['pool_id']==pool_id and catalog.row('equipment_templates',row['equipment_id'])['enabled']=='1' and int(catalog.row('equipment_templates',row['equipment_id'])['level_min'])<=upper and int(catalog.row('equipment_templates',row['equipment_id'])['level_max'])>=lower]
    boss = template['rank']=='boss'
    rewards = []
    opportunities = min(progress.get('loot',0),2 if boss else 1)
    for index in range(opportunities):
        gear = bool(pool) and progress.get('gear',0)>0 and index==0 and (boss or rng.random()<.2)
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
            rewards.append({'kind':'material','item':row,'quantity':rng.randint(int(material['quantity_min']),int(material['quantity_max']))})
    return rewards
