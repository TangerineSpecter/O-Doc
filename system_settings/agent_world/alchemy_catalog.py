"""炼金配方规则：只读默认目录，规则和图标在首次写入时持久化。"""
import copy
from decimal import Decimal, InvalidOperation
from rest_framework import serializers
from .alchemy_models import AlchemyCatalog

# 与战斗内容包 materials.csv 保持一致的稳定素材目录；迷宫的掉落关系由战斗域维护。
MATERIALS = {
    'combat.material.moss_cave.1': None,
    'combat.material.sprout_meadow.rabbit': None,
    'combat.material.sprout_meadow.beetle': None,
    'combat.material.sprout_meadow.glowbug': None,
    'combat.material.moss_cave.2': None,
    'combat.material.moss_cave.crystal_lizard': None,
    'combat.material.moss_cave.3': None,
    'combat.material.moss_cave.4': None,
    'combat.material.abandoned_mine.1': None,
    'combat.material.abandoned_mine.2': None,
    'combat.material.abandoned_mine.3': None,
    'combat.material.abandoned_mine.4': None,
    'combat.material.mist_forest.1': None,
    'combat.material.mist_forest.2': None,
    'combat.material.mist_forest.3': None,
    'combat.material.mist_forest.4': None,
    'combat.material.sunken_ruins.1': None,
    'combat.material.sunken_ruins.2': None,
    'combat.material.sunken_ruins.3': None,
    'combat.material.sunken_ruins.4': None,
    'combat.material.ember_fortress.1': None,
    'combat.material.ember_fortress.2': None,
    'combat.material.ember_fortress.3': None,
    'combat.material.ember_fortress.4': None,
    'combat.material.star_rift.1': None,
    'combat.material.star_rift.2': None,
    'combat.material.star_rift.3': None,
    'combat.material.star_rift.4': None,
}
# The combat bundle is the single source of current material prices. Keep the
# existing alchemy SKU set stable so old plans and editable recipes remain valid.
from .combat.catalog import bundled
_combat_catalog, _ = bundled()
MATERIALS = {sku: (row['name'], int(row['level']), row['sale_price'])
             for sku in MATERIALS
             for row in [_combat_catalog.row('materials', sku.removeprefix('combat.'))]}
DUNGEONS = {
    'sprout_meadow': '新芽草甸', 'moss_cave': '苔石洞窟', 'abandoned_mine': '废弃矿坑',
    'mist_forest': '迷雾林地', 'sunken_ruins': '沉没遗迹', 'ember_fortress': '灰烬堡垒',
    'star_rift': '星蚀裂隙',
}
DESCRIPTION = '炼金只消耗背包中的迷宫素材；药水为一次性战斗消耗品，商店不出售。'

RECIPES = [
    {'id': 'healing', 'name': '愈合药剂', 'required_level': 1,
     'experience': 12, 'energy_cost': 1,
     'ingredients': [('combat.material.moss_cave.1', 2), ('combat.material.sprout_meadow.rabbit', 1)]},
    {'id': 'focus', 'name': '灵思药剂', 'required_level': 2,
     'experience': 16, 'energy_cost': 1,
     'ingredients': [('combat.material.moss_cave.2', 2), ('combat.material.sprout_meadow.glowbug', 1)]},
    {'id': 'iron', 'name': '铁壁药剂', 'required_level': 3,
     'experience': 22, 'energy_cost': 1,
     'ingredients': [('combat.material.abandoned_mine.2', 2), ('combat.material.moss_cave.3', 1)]},
    {'id': 'fury', 'name': '狂暴药剂', 'required_level': 4,
     'experience': 28, 'energy_cost': 1,
     'ingredients': [('combat.material.moss_cave.crystal_lizard', 1), ('combat.material.abandoned_mine.1', 2)]},
    {'id': 'regen', 'name': '再生药剂', 'required_level': 5,
     'experience': 36, 'energy_cost': 1,
     'ingredients': [('combat.material.mist_forest.3', 1), ('combat.material.mist_forest.1', 2)]},
    {'id': 'arcane', 'name': '秘法药剂', 'required_level': 6,
     'experience': 46, 'energy_cost': 1,
     'ingredients': [('combat.material.sunken_ruins.3', 1), ('combat.material.sunken_ruins.2', 2)]},
    {'id': 'ember', 'name': '烈焰药剂', 'required_level': 7,
     'experience': 58, 'energy_cost': 1,
     'ingredients': [('combat.material.ember_fortress.3', 1), ('combat.material.ember_fortress.1', 2)]},
    {'id': 'aegis', 'name': '圣盾药剂', 'required_level': 8,
     'experience': 68, 'energy_cost': 1,
     'ingredients': [('combat.material.abandoned_mine.3', 1), ('combat.material.ember_fortress.2', 2)]},
    {'id': 'star', 'name': '星辰药剂', 'required_level': 9,
     'experience': 80, 'energy_cost': 1,
     'ingredients': [('combat.material.star_rift.2', 2), ('combat.material.star_rift.1', 1)]},
    {'id': 'purify', 'name': '净化药剂', 'required_level': 10,
     'experience': 96, 'energy_cost': 1,
     'ingredients': [('combat.material.star_rift.3', 1), ('combat.material.star_rift.4', 1)]},
]
DEFAULT_RULES = {row['id']: {
    'name': row['name'], 'required_level': row['required_level'],
    'experience': row['experience'], 'energy_cost': row['energy_cost'],
    'ingredients': [{'sku': sku, 'quantity': quantity} for sku, quantity in row['ingredients']],
} for row in RECIPES}


def ingredient_value(ingredients: list[dict]) -> str:
    """One-star value uses current NPC recovery prices, not purchase lots."""
    amount = sum((Decimal(MATERIALS[row['sku']][2]) * row['quantity'] for row in ingredients), Decimal(0))
    return str(amount.quantize(Decimal('.01')))


for _rule in DEFAULT_RULES.values():
    _rule['sale_price'] = ingredient_value(_rule['ingredients'])


def rules_for(owner: str) -> dict:
    catalog = AlchemyCatalog.objects.filter(pk=owner).first()
    rules = copy.deepcopy(DEFAULT_RULES)
    if catalog:
        rules.update(copy.deepcopy(catalog.rules))
    for rule in rules.values():
        rule['sale_price'] = ingredient_value(rule['ingredients'])
    return rules


def catalog_for(owner: str) -> AlchemyCatalog:
    return AlchemyCatalog.objects.get_or_create(pk=owner, defaults={'rules': copy.deepcopy(DEFAULT_RULES)})[0]


def source_for(sku: str) -> str:
    dungeon = sku.split('.')[2] if sku.startswith('combat.material.') and len(sku.split('.')) > 2 else ''
    return DUNGEONS.get(dungeon, '')


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
    if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= len(MATERIALS):
        raise serializers.ValidationError('材料列表无效')
    seen = set()
    for row in ingredients:
        if not isinstance(row, dict) or set(row) != {'sku', 'quantity'} or not isinstance(row['sku'], str) or row['sku'] not in MATERIALS or row['sku'] in seen:
            raise serializers.ValidationError('材料必须为不同的现有迷宫素材')
        if type(row['quantity']) is not int or not 1 <= row['quantity'] <= 1000000:
            raise serializers.ValidationError('材料数量须为正整数且不超过 1000000')
        seen.add(row['sku'])
    return result


# Keep the existing import contract; growth is owned by the pure quality module.
from .alchemy_quality import skill_progress  # noqa: E402,F401
