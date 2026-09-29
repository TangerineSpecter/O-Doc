"""可编辑目录；在播种、购买动物及开始下一生产周期时保存规则快照。"""
import copy
import uuid
from rest_framework import serializers
from .farm_models import FarmCatalog

DEFAULT_RULES = {
    'crops': {
        'radish': {'name': '萝卜', 'growth_seconds': 3600, 'seed_price': 10, 'yield': 1, 'sale_price': 18},
        'potato': {'name': '土豆', 'growth_seconds': 7200, 'seed_price': 20, 'yield': 2, 'sale_price': 18},
        'corn': {'name': '玉米', 'growth_seconds': 14400, 'seed_price': 35, 'yield': 3, 'sale_price': 20}},
    'animals': {
        'chicken': {'name': '鸡', 'product': '鸡蛋', 'period_seconds': 86400, 'price': 150, 'sale_price': 30, 'building': 'coop'},
        'cow': {'name': '牛', 'product': '牛奶', 'period_seconds': 172800, 'price': 600, 'sale_price': 100, 'building': 'barn'},
        'sheep': {'name': '羊', 'product': '羊毛', 'period_seconds': 172800, 'price': 500, 'sale_price': 90, 'building': 'barn'}},
    'buildings': {'coop': {'name': '鸡舍', 'prices': [300, 600, 1200], 'capacities': [2, 4, 6]},
                  'barn': {'name': '牛羊舍', 'prices': [800, 1600, 3200], 'capacities': [2, 4, 6]}},
    'land_prices': [500, 1000, 2000], 'feed_price': 5, 'item_icons': {},
}


def catalog_for(owner: str) -> FarmCatalog:
    return FarmCatalog.objects.get_or_create(pk=owner, defaults={'seed': uuid.uuid4().hex, 'rules': copy.deepcopy(DEFAULT_RULES)})[0]


def normalized_rules(value: dict | None) -> dict:
    rules = copy.deepcopy(value if isinstance(value, dict) else DEFAULT_RULES)
    # Existing WebDAV snapshots may predate catalog-level image overrides.
    rules.setdefault('item_icons', {})
    return rules


def validate_rules(value: dict) -> dict:
    if isinstance(value, dict) and 'item_icons' not in value:
        value = {**value, 'item_icons': {}}
    if not isinstance(value, dict) or set(value) != set(DEFAULT_RULES):
        raise serializers.ValidationError('目录必须包含完整的作物、动物、建筑、土地及饲料配置')
    for group in ('crops', 'animals', 'buildings'):
        if not isinstance(value[group], dict) or set(value[group]) != set(DEFAULT_RULES[group]):
            raise serializers.ValidationError('首版目录类型不能增删')
        for key, row in value[group].items():
            template = DEFAULT_RULES[group][key]
            if not isinstance(row, dict) or set(row) != set(template):
                raise serializers.ValidationError('目录字段不完整')
            for field, original in template.items():
                current = row[field]
                if isinstance(original, int) and (type(current) is not int or not 1 <= current <= 1000000):
                    raise serializers.ValidationError('数值必须为 1 至 1000000 的整数')
                if isinstance(original, str) and current != original:
                    raise serializers.ValidationError('内置物品名称及建筑归属不能修改')
                if isinstance(original, list) and (not isinstance(current, list) or len(current) != 3 or any(type(n) is not int or not 1 <= n <= 1000000 for n in current)):
                    raise serializers.ValidationError('三级价格与容量必须为三个正整数')
            if group == 'buildings' and any(a >= b for a, b in zip(row['capacities'], row['capacities'][1:])):
                raise serializers.ValidationError('建筑各级容量必须严格递增')
    if not isinstance(value['land_prices'], list) or len(value['land_prices']) != 3 or any(type(n) is not int or not 1 <= n <= 1000000 for n in value['land_prices']):
        raise serializers.ValidationError('需要三个有效土地价格')
    if type(value['feed_price']) is not int or not 1 <= value['feed_price'] <= 1000000:
        raise serializers.ValidationError('饲料价格无效')
    if not isinstance(value['item_icons'], dict):
        raise serializers.ValidationError('物品图标配置无效')
    from .item_catalog_icons import catalog_item_names
    allowed_skus = set(catalog_item_names(value))
    for sku, asset_id in value['item_icons'].items():
        if sku not in allowed_skus or not isinstance(asset_id, str) or not asset_id or len(asset_id) > 32:
            raise serializers.ValidationError('物品图标关联无效')
    return value


def validate_crop_rule(value: dict) -> dict:
    fields = {'growth_seconds', 'seed_price', 'yield', 'sale_price'}
    if not isinstance(value, dict) or set(value) != fields:
        raise serializers.ValidationError('作物规则字段不完整')
    if any(type(number) is not int or not 1 <= number <= 1000000 for number in value.values()):
        raise serializers.ValidationError('数值必须为 1 至 1000000 的整数')
    return value
