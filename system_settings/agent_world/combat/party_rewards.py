"""One monster produces one shared loot roll; awards use the existing personal fact/asset chain."""
import hashlib
from copy import deepcopy
from . import rewards
from .party_rules import experience, equipment_chance, roll
from .models import CombatProfile, EquipmentInstance
from ..inventory_stock import add_stock


def loot(catalog, enemy, runs, count, rng):
    if count == 1:
        run = runs[0]
        profile = CombatProfile.objects.get(pk=run.actor_id)
        earned = rewards.drops(catalog, enemy['template_id'], enemy['level'], profile.loot_progress, rng, run.snapshot['profession_bonuses'])
        profile.save()
        return [(run.actor_id, reward, []) for reward in earned]
    base = 1 if enemy['rank']=='boss' else catalog.rules['normal_equipment_chance']
    probability = max(equipment_chance(base, r.snapshot['profession_bonuses'], int(catalog.rules['equipment_interval_seconds'])) for r in runs)
    # Use a temporary allowance, never the resident's accumulated solo allowance.
    allowance = {'gear': 1, 'loot': 2 if enemy['rank']=='boss' else 1}
    drops = rewards.drops(catalog, enemy['template_id'], enemy['level'], allowance, rng,
        {'maze_equipment_drop_bonus_percentage': max(0, probability-catalog.rules['normal_equipment_chance'])*100})
    result = []
    for reward in drops:
        winner, rolls = roll([r.actor_id for r in runs], rng)
        if reward['kind']=='material':
            profile = CombatProfile.objects.get(pk=winner)
            run = next(r for r in runs if r.actor_id==winner)
            bonus = run.snapshot['profession_bonuses'].get('maze_material_yield_percentage', 0)
            quantity = rewards._material_bonus_quantity(profile.loot_progress, reward['item']['id'], reward['quantity'], bonus)
            reward.update(quantity=reward['quantity']+quantity, profession_bonus_quantity=quantity, profession_bonus_percentage=str(bonus))
            profile.save()
        result.append((winner, reward, rolls))
    return result


def grant(run, reward, identity):
    reward = deepcopy(reward)
    item = reward['item']
    if reward['kind']=='equipment':
        key = hashlib.sha256(identity.encode()).hexdigest()
        EquipmentInstance.objects.create(pk=key, owner_id=run.owner_id, actor_id=run.actor_id,
            catalog_id=run.catalog_id, template_id=item['template_id'], snapshot=item, value=item['value'])
        reward['equipment_id'] = key
    else:
        add_stock(run.actor_id, run.owner_id, run.actor_name, 'combat.'+item['id'], reward['quantity'],
                  item['name'], 'combat_material', item['sale_price'], identity)
        from ..market_disposition import enqueue
        enqueue(run.owner_id, run.actor_id, 'combat.'+item['id'], reward['quantity'], source='loot', operation=identity)
    reward.update(id=identity, elapsed_seconds=run.elapsed_seconds)
    run.result['rewards'].append(reward)
    return reward
