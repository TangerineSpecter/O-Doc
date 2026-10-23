"""Live, unit-labelled opportunities for the activity selector; no asset writes."""
from collections import Counter
from itertools import combinations
from decimal import Decimal


def crafting(options: dict, kind: str) -> dict:
    quantity_key = 'max_portions' if kind == 'cooking' else 'max_bottles'
    unit = '份美食' if kind == 'cooking' else '瓶药水'
    from .cooking_limits import MAX_RECIPES
    from .alchemy_limits import MAX_RECIPES as ALCHEMY_MAX_RECIPES
    return {
        'available_recipes': [
            {'name': row['name'], 'max_quantity': row[quantity_key]}
            for row in options.values()
        ],
        'quantity_unit': unit,
        'quantity_basis': '每种单独制作时，按当前未预留材料、可用体力和单配方制作上限计算；共享材料和体力，数量不可相加',
        'max_recipe_types_per_visit': MAX_RECIPES if kind == 'cooking' else ALCHEMY_MAX_RECIPES,
        'opportunity': f'当前可制作{len(options)}种，单种最多{max(row[quantity_key] for row in options.values())}{unit}；具体各自数量见available_recipes',
    }


def forging(goals: dict, energy) -> dict:
    """At most three goals: enumerate subsets to avoid double-counting materials."""
    ready = [row for row in goals['goals'] if row['ready']]
    limit = min(3, int(Decimal(energy) // 2), len(ready))
    craftable = 0
    for size in range(limit, 0, -1):
        for subset in combinations(ready, size):
            needed, stock = Counter(), {}
            for goal in subset:
                for part in goal['ingredients']:
                    needed[part['sku']] += part['required']
                    stock[part['sku']] = part['available']
            if all(stock[sku] >= quantity for sku, quantity in needed.items()):
                craftable = size
                break
        if craftable:
            break
    registerable = goals['free_slots'] if goals['can_register'] else 0
    return {'registerable_goals': registerable, 'craftable_equipment_now': craftable,
            'opportunity': f'当前可登记{registerable}个新打造目标，可用现有材料和体力打造{craftable}件已登记装备；登记目标不要求材料齐备'}


def forging_needs(owner: str, actor: str, *, can_explore: bool) -> list[dict]:
    """Goal demand survives even when a full, unready forge is not a candidate."""
    from .blacksmith_models import BlacksmithGoal
    if not BlacksmithGoal.objects.filter(owner_id=owner, actor_id=actor, status='active').exists():
        return []
    from .blacksmith_goals import summary
    goals = summary(owner, actor)['goals']
    if not goals:
        return []
    from .combat.models import CombatProfile
    from .blacksmith_candidates import read_catalog
    from .blacksmith_catalog import material_definitions
    profile = CombatProfile.objects.get(pk=actor, owner_id=owner)
    definitions = material_definitions(read_catalog(profile))
    required, available, names = Counter(), {}, {}
    for goal in goals:
        for part in goal['ingredients']:
            sku = part['sku']
            required[sku] += part['required']
            # Each goal sees the same pool; count that pool only once.
            available[sku] = part['available']
            names[sku] = part['name']
    materials = []
    for sku, quantity in sorted(required.items()):
        missing = max(0, quantity - available[sku])
        sources = {}
        if missing:
            for source in definitions.get(sku, {}).get('sources', []):
                sources[source['dungeon_id']] = {
                    'name': source['dungeon_name'],
                    'required_level': source['dungeon_level_min'],
                    'currently_reachable': source['dungeon_level_min'] <= profile.progression['level'],
                }
        materials.append({'sku': sku, 'name': names[sku], 'required_quantity': quantity,
                          'available_quantity': available[sku], 'missing_quantity': missing,
                          'source_dungeons': list(sources.values())})
    gatherable = can_explore and any(row['missing_quantity'] and any(
        source['currently_reachable'] for source in row['source_dungeons']) for row in materials)
    return [{'kind': 'blacksmith_materials',
             'goals': [{'equipment': goal['type_name'], 'slot': goal['slot_name'],
                        'level_band': goal['band_label']} for goal in goals],
             'materials': materials, 'can_gather_by_exploration_now': gatherable,
             'meaning': '这些是全部有效待打造目标的当前合计材料需求；同一库存只抵扣一次。缺料且可探索时，可考虑冒险采集当前等级可达迷宫的材料；掉落不保证，不能采集的高等级材料不作为当前冒险收益。材料齐备后可考虑打造，仍以合法活动候选为准。'}]


def fishing(owner: str, actor: str, now, rules: dict, times: list[int], energy) -> dict:
    from .fishing.service import inventory, spots
    from .fishing.rules import bait_facts
    stock = inventory(owner, actor)
    available = []
    for spot_id, spot in spots(owner, actor, now, rules).items():
        for minutes in times:
            baits = bait_facts(rules, stock, spot_id, now, minutes)
            bait_count = sum(row['quantity'] for row in baits.values())
            casts = min(bait_count, minutes * 60 // rules['interval_seconds'],
                        int(Decimal(energy) // rules['energy_cost']))
            if casts:
                available.append({'spot': spot['name'], 'minutes': minutes, 'max_casts': casts})
    maximum = max((row['max_casts'] for row in available), default=0)
    return {'fishing_opportunities': maximum, 'available_trips': available,
            'opportunity': f'当前合法钓点中，单次出行最多可抛竿{maximum}次（不是保证捕获数量）；各钓点和时长为替代方案，次数不可相加'}
