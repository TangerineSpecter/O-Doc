"""Server-issued alchemy plans freeze rules and allocate all bottles before execution."""
import copy
import json
from collections import Counter
from decimal import Decimal
from .alchemy_materials import material_pool, allocate
from .alchemy_quality import RULES, material_stars, material_tier
from .alchemy_limits import MAX_RECIPES, MAX_BOTTLES, MAX_TOTAL


def base_values_for() -> dict:
    from .alchemy_catalog import MATERIALS
    return {sku: row[2] for sku, row in MATERIALS.items()}


def tiers_for() -> dict:
    from .alchemy_catalog import MATERIALS
    return {sku: material_tier(row[1]) for sku, row in MATERIALS.items()}


def build_plan(owner: str, actor_id: str, choices: list[dict], options: list[dict], energy,
               *, pool: list[dict] | None = None) -> list[dict]:
    if (not isinstance(choices, list) or len(choices) > MAX_RECIPES
            or any(type(row.get('quantity')) is not int or not 1 <= row['quantity'] <= MAX_BOTTLES for row in choices)
            or len({row['recipe_id'] for row in choices}) != len(choices)):
        raise ValueError('一次最多制作三道、每道一至五瓶')
    pool = material_pool(actor_id, owner) if pool is None else copy.deepcopy(pool)
    available, selected, spent = {row['id']: row for row in options}, [], 0
    base_values, tiers = base_values_for(), tiers_for()
    for choice in choices:
        row = available[choice['recipe_id']]
        for _ in range(choice['quantity']):
            spent += row['energy_cost']
            if spent > energy:
                raise ValueError('炼金计划总体力不足')
            snapshot = {field: copy.deepcopy(row[field]) for field in
                        ('name', 'required_level', 'sale_price', 'experience', 'energy_cost')}
            snapshot['ingredients'] = [{'sku': i['sku'], 'quantity': i['quantity']} for i in row['ingredients']]
            snapshot.update(quality_rules=copy.deepcopy(RULES),
                            base_values={i['sku']: base_values[i['sku']] for i in snapshot['ingredients']},
                            material_tiers={i['sku']: tiers[i['sku']] for i in snapshot['ingredients']},
                            materials=allocate(pool, snapshot['ingredients']))
            selected.append({'recipe_id': choice['recipe_id'], 'rule': snapshot})
    if len(selected) > MAX_TOTAL:
        raise ValueError('一次最多制作十五瓶')
    return selected


def validate_quality_snapshot(snapshot: dict) -> None:
    from .alchemy_catalog import validate_rule
    from rest_framework.exceptions import ValidationError
    try:
        validate_rule({key: snapshot[key] for key in ('ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost')})
        if not isinstance(snapshot['name'], str) or not snapshot['name']:
            raise ValueError('制作名称缺失')
    except (KeyError, ValidationError) as exc:
        raise ValueError('炼金配方快照缺失或无效') from exc
    if json.dumps(snapshot.get('quality_rules'), sort_keys=True) != json.dumps(RULES, sort_keys=True):
        raise ValueError('炼金品质规则无效')
    expected = Counter({row['sku']: row['quantity'] for row in snapshot['ingredients']})
    actual, seen = Counter(), set()
    for row in snapshot['materials']:
        if not isinstance(row['inventory_id'], str) or not row['inventory_id'] or row['inventory_id'] in seen:
            raise ValueError('炼金材料身份重复或无效')
        seen.add(row['inventory_id'])
        actual[row['sku']] += row['quantity']
        if (type(row['quantity']) is not int or row['quantity'] < 1 or
                not Decimal(str(row['price'])).is_finite() or Decimal(str(row['price'])) < 0):
            raise ValueError('炼金材料价值无效')
    if actual != expected or set(snapshot['base_values']) != set(expected) or set(snapshot['material_tiers']) != set(expected):
        raise ValueError('炼金材料数量与配方不一致')
    material_stars(snapshot['materials'], snapshot['base_values'], snapshot['material_tiers'])
