"""Versioned cooking quality, prices and growth; deterministic and database-free."""
import hashlib
import math
from decimal import Decimal, ROUND_CEILING

VERSION = 1
STRATEGIES = ('low_stars_first', 'high_stars_first')
RULES = {'version': VERSION, 'base_p': .04, 'skill_bonus': .46, 'skill_power': .8,
         'material_bonus': .25, 'value_multipliers': ['1', '1.2', '1.5', '1.8', '2.2'],
         'experience_multipliers': ['1', '1.1', '1.2', '1.3', '1.4']}


def level_cost(level: int) -> int:
    if type(level) is not int or not 1 <= level <= 98:
        raise ValueError('厨艺升级等级无效')
    x = level - 10
    return 200 * level - 100 if level < 10 else 1900 + 10 * x + (x * x + 1) // 2


def skill_progress(experience: int) -> dict:
    level, floor = 1, 0
    while level < 99 and experience >= floor + level_cost(level):
        floor += level_cost(level)
        level += 1
    ceiling = floor + level_cost(level) if level < 99 else None
    return {'level': level, 'experience': experience, 'level_experience': experience - floor,
            'next_level_experience': ceiling,
            'progress': min(1, (experience - floor) / (ceiling - floor)) if ceiling else 1}


def material_stars(materials: list[dict], base_values: dict) -> Decimal:
    weight = weighted = Decimal(0)
    for row in materials:
        stars = row['stars'] if row['sku'].startswith('crop.') else 1
        if type(stars) is not int or not 1 <= stars <= 5 or type(row['quantity']) is not int or row['quantity'] < 1:
            raise ValueError('制作材料品质无效')
        value = Decimal(str(base_values[row['sku']]))
        if not value.is_finite() or value <= 0:
            raise ValueError('制作材料基础价值无效')
        part = value * row['quantity']
        weight += part
        weighted += part * stars
    if not weight:
        raise ValueError('制作材料为空')
    return weighted / weight


def probabilities(level: int, average, rules: dict = RULES) -> list[float]:
    if type(level) is not int or not 1 <= level <= 99 or not 1 <= Decimal(str(average)) <= 5:
        raise ValueError('制作品质参数无效')
    if rules != RULES:
        raise ValueError('不支持的制作品质规则')
    p = rules['base_p'] + rules['skill_bonus'] * ((level - 1) / 98) ** rules['skill_power']
    p += rules['material_bonus'] * float((Decimal(str(average)) - 1) / 4)
    return [math.comb(4, k) * p ** k * (1 - p) ** (4 - k) for k in range(5)]


def unit_value(price, stars: int, rules: dict = RULES) -> Decimal:
    if type(stars) is not int or not 1 <= stars <= 5:
        raise ValueError('美食星级必须为1至5')
    price = Decimal(str(price))
    return price if stars == 1 else (price * Decimal(rules['value_multipliers'][stars - 1])).to_integral_value(rounding=ROUND_CEILING)


def experience_for(base: int, stars: int, rules: dict = RULES) -> int:
    unit_value(1, stars, rules)
    return int(Decimal(base) * Decimal(rules['experience_multipliers'][stars - 1]))


def outcome(operation_id: str, level: int, materials: list[dict], snapshot: dict) -> dict:
    rules = snapshot['quality_rules']
    average = material_stars(materials, snapshot['base_values'])
    distribution = probabilities(level, average, rules)
    seed = f'cooking:{rules["version"]}:{operation_id}'
    draw = int(hashlib.sha256(seed.encode()).hexdigest()[:13], 16) / 16 ** 13
    cumulative, stars = 0, 5
    for index, probability in enumerate(distribution, 1):
        cumulative += probability
        if draw < cumulative:
            stars = index
            break
    return {'stars': stars, 'unit_price': str(unit_value(snapshot['sale_price'], stars, rules)),
            'experience_gained': experience_for(snapshot['experience'], stars, rules),
            'material_stars': str(average), 'cooking_level': level,
            'random_seed': seed, 'random_draw': draw}


def estimate(rule: dict, level: int, materials: list[dict], base_values: dict) -> dict:
    average = material_stars(materials, base_values)
    distribution = probabilities(level, average)
    value = sum((Decimal(lot['price']) * lot['quantity'] for row in materials for lot in row['lots']), Decimal(0))
    prices = [unit_value(rule['sale_price'], stars) for stars in range(1, 6)]
    experiences = [experience_for(rule['experience'], stars) for stars in range(1, 6)]
    revenue = sum(Decimal(str(p)) * price for p, price in zip(distribution, prices))
    return {'materials': materials, 'material_stars': str(average), 'star_probabilities': distribution,
            'star_values': [str(price) for price in prices], 'star_experiences': experiences,
            'ingredient_value': str(value), 'expected_revenue': str(revenue.quantize(Decimal('.0001'))),
            'expected_experience': sum(p * xp for p, xp in zip(distribution, experiences)),
            'expected_processing_gain': str((revenue - value).quantize(Decimal('.0001')))}
