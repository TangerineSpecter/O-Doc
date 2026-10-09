"""可编辑目录；在播种、购买动物及开始下一生产周期时保存规则快照。"""
import copy
import uuid
from rest_framework import serializers
from .farm_models import FarmCatalog
from .farm_quality import FERTILIZERS

DEFAULT_RULES = {
    'crops': {
        'radish': {'name': '萝卜', 'growth_seconds': 3600, 'seed_price': 10, 'yield': 1, 'sale_price': 18},
        'potato': {'name': '土豆', 'growth_seconds': 7200, 'seed_price': 20, 'yield': 2, 'sale_price': 18},
        'corn': {'name': '玉米', 'growth_seconds': 14400, 'seed_price': 35, 'yield': 3, 'sale_price': 20},
        'peanut': {'name': '花生', 'growth_seconds': 21600, 'seed_price': 50, 'yield': 4, 'sale_price': 23},
        'soybean': {'name': '大豆', 'growth_seconds': 10800, 'seed_price': 28, 'yield': 3, 'sale_price': 17},
        'strawberry': {'name': '草莓', 'growth_seconds': 7200, 'seed_price': 40, 'yield': 2, 'sale_price': 35},
        'pumpkin': {'name': '南瓜', 'growth_seconds': 28800, 'seed_price': 70, 'yield': 2, 'sale_price': 65},
        'sunflower': {'name': '向日葵', 'growth_seconds': 43200, 'seed_price': 90, 'yield': 5, 'sale_price': 34},
        'wheat': {'name': '小麦', 'growth_seconds': 21600, 'seed_price': 45, 'yield': 4, 'sale_price': 21},
        'rice': {'name': '水稻', 'growth_seconds': 28800, 'seed_price': 60, 'yield': 4, 'sale_price': 28},
        'tomato': {'name': '番茄', 'growth_seconds': 10800, 'seed_price': 30, 'yield': 3, 'sale_price': 19},
        'cabbage': {'name': '卷心菜', 'growth_seconds': 14400, 'seed_price': 32, 'yield': 2, 'sale_price': 29},
        'cucumber': {'name': '黄瓜', 'growth_seconds': 7200, 'seed_price': 24, 'yield': 2, 'sale_price': 21},
        'eggplant': {'name': '茄子', 'growth_seconds': 14400, 'seed_price': 38, 'yield': 3, 'sale_price': 23},
        'chili': {'name': '辣椒', 'growth_seconds': 10800, 'seed_price': 26, 'yield': 4, 'sale_price': 13},
        'onion': {'name': '洋葱', 'growth_seconds': 18000, 'seed_price': 36, 'yield': 3, 'sale_price': 23}},
    'animals': {
        'chicken': {'name': '鸡', 'product': '鸡蛋', 'period_seconds': 86400, 'price': 150, 'sale_price': 30, 'building': 'coop'},
        'cow': {'name': '牛', 'product': '牛奶', 'period_seconds': 172800, 'price': 600, 'sale_price': 100, 'building': 'barn'},
        'sheep': {'name': '羊', 'product': '羊毛', 'period_seconds': 172800, 'price': 500, 'sale_price': 90, 'building': 'barn'}},
    'buildings': {'coop': {'name': '鸡舍', 'prices': [300, 600, 1200], 'capacities': [2, 4, 6]},
                  'barn': {'name': '牛羊舍', 'prices': [800, 1600, 3200], 'capacities': [2, 4, 6]}},
    'fertilizers': copy.deepcopy(FERTILIZERS),
    'land_prices': [500, 1000, 2000], 'feed_price': 5, 'item_icons': {},
}


def catalog_for(owner: str) -> FarmCatalog:
    catalog = FarmCatalog.objects.get_or_create(pk=owner, defaults={'seed': uuid.uuid4().hex, 'rules': copy.deepcopy(DEFAULT_RULES)})[0]
    # Derive missing built-ins without changing synchronized snapshot timestamps on reads.
    # Configuration writes persist this complete catalog; running crops keep their snapshots.
    catalog.rules = normalized_rules(catalog.rules)
    return catalog


def normalized_rules(value: dict | None) -> dict:
    rules = copy.deepcopy(value if isinstance(value, dict) else DEFAULT_RULES)
    # Existing WebDAV snapshots may predate catalog-level image overrides.
    rules.setdefault('item_icons', {})
    rules.setdefault('fertilizers', copy.deepcopy(FERTILIZERS))
    for kind, rule in DEFAULT_RULES['crops'].items():
        rules.setdefault('crops', {}).setdefault(kind, copy.deepcopy(rule))
    return rules


def validate_rules(value: dict) -> dict:
    if isinstance(value, dict) and 'item_icons' not in value:
        value = {**value, 'item_icons': {}}
    if isinstance(value, dict) and 'fertilizers' not in value:
        value = {**value, 'fertilizers': copy.deepcopy(FERTILIZERS)}
    if not isinstance(value, dict) or set(value) != set(DEFAULT_RULES):
        raise serializers.ValidationError('目录必须包含完整的作物、动物、建筑、土地及饲料配置')
    if not isinstance(value['crops'], dict) or not {'radish', 'potato', 'corn'} <= set(value['crops']):
        raise serializers.ValidationError('作物目录不完整')
    value = normalized_rules(value)
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
    fertilizers = value['fertilizers']
    if not isinstance(fertilizers, dict) or set(fertilizers) != set(FERTILIZERS):
        raise serializers.ValidationError('两种肥料配置不完整')
    for kind, row in fertilizers.items():
        if not isinstance(row, dict) or set(row) != set(FERTILIZERS[kind]) or row['name'] != FERTILIZERS[kind]['name']:
            raise serializers.ValidationError('肥料字段无效')
        if type(row['base_price']) is not int or not 1 <= row['base_price'] <= 1000000 or type(row['fluctuation']) is not int or not 0 <= row['fluctuation'] < row['base_price']:
            raise serializers.ValidationError('肥料价格与波动范围无效')
        if isinstance(row['quality_bonus'], bool) or not isinstance(row['quality_bonus'], (int, float)) or not 0 <= row['quality_bonus'] <= .2 or type(row['yield_percentage']) is not int or not 0 <= row['yield_percentage'] <= 100:
            raise serializers.ValidationError('肥料效果无效')
        if (kind == 'quality' and row['yield_percentage'] != 0) or (kind == 'yield' and row['quality_bonus'] != 0):
            raise serializers.ValidationError('品质肥与增产肥职责不能混用')
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
