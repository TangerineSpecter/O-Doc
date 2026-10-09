"""Server-issued plans freeze rules and allocate all portions before execution."""
import copy
import json
from collections import Counter
from decimal import Decimal
from .cooking_materials import material_pool, allocate
from .cooking_quality import RULES, STRATEGIES, material_stars


def base_values_for(owner: str) -> dict:
    from .farm_catalog import DEFAULT_RULES, normalized_rules
    from .farm_models import FarmCatalog
    catalog = FarmCatalog.objects.filter(pk=owner).first()
    rules = normalized_rules(catalog.rules if catalog else DEFAULT_RULES)
    values = {f'crop.{key}': str(row['sale_price']) for key, row in rules['crops'].items()}
    values.update({'product.chicken.normal': str(rules['animals']['chicken']['sale_price']),
                   'product.cow.normal': str(rules['animals']['cow']['sale_price'])})
    return values


def build_plan(owner: str, actor_id: str, choices: list[dict], options: list[dict], energy) -> list[dict]:
    pool, available, selected, spent = material_pool(actor_id, owner), {row['id']: row for row in options}, [], 0
    base_values = base_values_for(owner)
    for choice in choices:
        row = available[choice['recipe_id']]
        strategy = choice.get('ingredient_strategy', 'low_stars_first')
        for _ in range(choice['quantity']):
            spent += row['energy_cost']
            if spent > energy:
                raise ValueError('制作计划总体力不足')
            snapshot = {field: copy.deepcopy(row[field]) for field in
                        ('name', 'required_level', 'sale_price', 'experience', 'energy_cost')}
            snapshot['ingredients'] = [{'sku': i['sku'], 'quantity': i['quantity']} for i in row['ingredients']]
            snapshot.update(quality_rules=copy.deepcopy(RULES), ingredient_strategy=strategy,
                            base_values={i['sku']: base_values[i['sku']] for i in snapshot['ingredients']},
                            materials=allocate(pool, snapshot['ingredients'], strategy))
            selected.append({'recipe_id': choice['recipe_id'], 'rule': snapshot})
    if len(selected) > 6:
        raise ValueError('一次最多制作六份')
    return selected


def validate_quality_snapshot(snapshot: dict) -> None:
    from .cooking_catalog import validate_rule
    from rest_framework.exceptions import ValidationError
    try:
        validate_rule({key: snapshot[key] for key in ('ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost')})
        if not isinstance(snapshot['name'], str) or not snapshot['name']:
            raise ValueError('制作名称缺失')
    except (KeyError, ValidationError) as exc:
        raise ValueError('制作配方快照缺失或无效') from exc
    if json.dumps(snapshot.get('quality_rules'), sort_keys=True) != json.dumps(RULES, sort_keys=True) or snapshot.get('ingredient_strategy') not in STRATEGIES:
        raise ValueError('制作品质规则或材料策略无效')
    expected = Counter({row['sku']: row['quantity'] for row in snapshot['ingredients']})
    actual, seen = Counter(), set()
    for row in snapshot['materials']:
        if not isinstance(row['inventory_id'], str) or not row['inventory_id'] or row['inventory_id'] in seen:
            raise ValueError('制作材料身份重复或无效')
        seen.add(row['inventory_id'])
        actual[row['sku']] += row['quantity']
        if (not row['lots'] or any(type(lot['quantity']) is not int or lot['quantity'] < 1 or
                not Decimal(lot['price']).is_finite() or Decimal(lot['price']) < 0 for lot in row['lots']) or
                sum(lot['quantity'] for lot in row['lots']) != row['quantity']):
            raise ValueError('制作材料价值批次无效')
        if not row['sku'].startswith('crop.') and row['stars'] != 1:
            raise ValueError('普通畜产品材料必须为一星')
    if actual != expected or set(snapshot['base_values']) != set(expected):
        raise ValueError('制作材料数量与配方不一致')
    material_stars(snapshot['materials'], snapshot['base_values'])

