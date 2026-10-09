"""默认食谱只派生读取；规则和图标在首次写入时持久化。"""
import copy
from decimal import Decimal, InvalidOperation
from rest_framework import serializers
from .farm_catalog import DEFAULT_RULES as FARM_RULES
from .cooking_models import CookingCatalog

RECIPES = [
    ('baked_potato', '烤土豆', 1, 46, {'potato': 2}),
    ('smashed_cucumber', '拍黄瓜', 1, 54, {'cucumber': 2}),
    ('roasted_corn', '烤玉米', 1, 52, {'corn': 2}),
    ('radish_stir_fry', '萝卜小炒', 2, 77, {'radish': 2, 'onion': 1}),
    ('tomato_eggs', '番茄炒蛋', 2, 90, {'tomato': 2, 'egg': 1}),
    ('cabbage_stir_fry', '醋溜卷心菜', 2, 92, {'cabbage': 2, 'chili': 1}),
    ('spiced_peanuts', '五香花生', 3, 80, {'peanut': 2, 'chili': 1}),
    ('peanut_soymilk', '花生豆浆', 3, 78, {'peanut': 1, 'soybean': 2}),
    ('eggplant_rice', '茄子焖饭', 3, 104, {'eggplant': 1, 'rice': 1, 'onion': 1}),
    ('garden_fried_rice', '田园炒饭', 4, 113, {'rice': 1, 'corn': 1, 'egg': 1}),
    ('pumpkin_soup', '南瓜浓汤', 4, 273, {'pumpkin': 1, 'milk': 1, 'onion': 1}),
    ('onion_pancake', '葱香薄饼', 4, 138, {'wheat': 2, 'onion': 1, 'egg': 1}),
    ('strawberry_pudding', '草莓布丁', 5, 310, {'strawberry': 2, 'milk': 1, 'egg': 1}),
    ('spicy_eggplant', '香辣茄子', 5, 138, {'eggplant': 2, 'chili': 2, 'onion': 1}),
    ('vegetable_rice', '蔬菜烩饭', 6, 149, {'rice': 1, 'tomato': 1, 'eggplant': 1, 'onion': 1}),
    ('milk_corn_cake', '奶香玉米饼', 6, 242, {'wheat': 1, 'corn': 2, 'milk': 1}),
    ('sunflower_crisp', '瓜子酥', 7, 179, {'sunflower': 2, 'wheat': 1, 'egg': 1}),
    ('strawberry_cake', '草莓蛋糕', 8, 450, {'wheat': 2, 'strawberry': 2, 'milk': 1, 'egg': 2}),
    ('pumpkin_pie', '南瓜奶香派', 9, 367, {'pumpkin': 1, 'wheat': 2, 'milk': 1, 'egg': 1}),
    ('harvest_platter', '丰收拼盘', 10, 208, {'potato': 1, 'corn': 1, 'tomato': 1, 'cabbage': 1, 'cucumber': 1, 'eggplant': 1}),
]
INGREDIENTS = {f'crop.{key}': row['name'] for key, row in FARM_RULES['crops'].items()}
INGREDIENTS.update({'product.chicken.normal': '普通鸡蛋', 'product.cow.normal': '普通牛奶'})
DESCRIPTION = '基础调味料和水不占库存；小麦、水稻、大豆及向日葵的基础处理包含在制作中。仅使用指定普通食材。'
DEFAULT_RULES = {key: {'name': name, 'required_level': level, 'sale_price': str(price),
    'experience': level * 10, 'energy_cost': 2 + (level - 1) // 3,
    'ingredients': [{'sku': {'egg': 'product.chicken.normal', 'milk': 'product.cow.normal'}.get(k, 'crop.' + k), 'quantity': q} for k, q in ingredients.items()]}
    for key, name, level, price, ingredients in RECIPES}


def rules_for(owner: str) -> dict:
    catalog = CookingCatalog.objects.filter(pk=owner).first()
    rules = copy.deepcopy(DEFAULT_RULES)
    if catalog:
        rules.update(copy.deepcopy(catalog.rules))
    return rules


def catalog_for(owner: str) -> CookingCatalog:
    return CookingCatalog.objects.get_or_create(pk=owner, defaults={'rules': copy.deepcopy(DEFAULT_RULES)})[0]


def validate_rule(value: dict) -> dict:
    if not isinstance(value, dict) or set(value) != {'ingredients', 'required_level', 'sale_price', 'experience', 'energy_cost'}:
        raise serializers.ValidationError('请提供完整的材料、等级、售价、经验和体力规则')
    result = copy.deepcopy(value)
    for field, upper in (('required_level', 10), ('experience', 1000000), ('energy_cost', 100)):
        if type(value[field]) is not int or not 1 <= value[field] <= upper:
            raise serializers.ValidationError(f'{field} 必须为 1 至 {upper} 的整数')
    try:
        price = Decimal(str(value['sale_price']))
        if not price.is_finite() or not 0 < price <= 1000000 or price != price.quantize(Decimal('.01')):
            raise ValueError()
    except (InvalidOperation, ValueError):
        raise serializers.ValidationError('售价须为不超过 1000000 的正金额，最多两位小数')
    result['sale_price'] = str(price.quantize(Decimal('.01')))
    ingredients = value['ingredients']
    if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= len(INGREDIENTS):
        raise serializers.ValidationError('材料列表无效')
    seen = set()
    for row in ingredients:
        if not isinstance(row, dict) or set(row) != {'sku', 'quantity'} or not isinstance(row['sku'], str) or row['sku'] not in INGREDIENTS or row['sku'] in seen:
            raise serializers.ValidationError('材料必须为不同的现有作物、普通鸡蛋或普通牛奶')
        if type(row['quantity']) is not int or not 1 <= row['quantity'] <= 1000000:
            raise serializers.ValidationError('材料数量须为正整数且不超过 1000000')
        seen.add(row['sku'])
    return result


def skill_progress(experience: int) -> dict:
    level = max(i for i in range(1, 11) if experience >= 100 * (i - 1) ** 2)
    floor = 100 * (level - 1) ** 2
    ceiling = 100 * level ** 2 if level < 10 else None
    return {'level': level, 'experience': experience, 'level_experience': experience - floor,
            'next_level_experience': ceiling, 'progress': min(1, (experience - floor) / (ceiling - floor)) if ceiling else 1}
