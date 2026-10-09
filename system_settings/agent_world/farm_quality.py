"""Versioned, deterministic crop quality and planting growth rules; no database writes."""
import hashlib
import math
from decimal import Decimal, ROUND_CEILING

VERSION = 1
FERTILIZERS = {
    'quality': {'name': '品质肥', 'base_price': 15, 'fluctuation': 5, 'quality_bonus': 0.10, 'yield_percentage': 0},
    'yield': {'name': '增产肥', 'base_price': 35, 'fluctuation': 10, 'quality_bonus': 0, 'yield_percentage': 25},
}
VALUE_MULTIPLIERS = ('1', '1.2', '1.5', '1.8', '2.2')
EVENT_NAMES = {'normal': '正常生长', 'pests': '轻微虫害', 'cold': '低温影响'}


def level_cost(level: int) -> int:
    return (200 + 20 * level + level * level + 1) // 2


def skill_progress(experience: int) -> dict:
    level, floor = 1, 0
    while level < 99 and experience >= floor + level_cost(level):
        floor += level_cost(level)
        level += 1
    cost = level_cost(level) if level < 99 else None
    return {'level': level, 'experience': experience, 'level_floor': floor,
            'next_level_experience': floor + cost if cost else None,
            'progress': min(1, (experience - floor) / cost) if cost else 1}


def probabilities(level: int, bonus: float = 0) -> list[float]:
    if not 1 <= level <= 99 or not 0 <= bonus <= .2:
        raise ValueError('种植品质参数无效')
    p = .04 + .51 * ((level - 1) / 98) ** .8 + bonus
    return [math.comb(4, k) * p ** k * (1 - p) ** (4 - k) for k in range(5)]


def roll(seed: str, label: str) -> float:
    return int(hashlib.sha256(f'{seed}:{label}'.encode()).hexdigest()[:13], 16) / 16 ** 13


def unit_value(price, stars: int) -> int:
    if type(stars) is not int or not 1 <= stars <= 5:
        raise ValueError('作物星级必须为1至5')
    return int((Decimal(str(price)) * Decimal(VALUE_MULTIPLIERS[stars - 1])).to_integral_value(rounding=ROUND_CEILING))


def experience_for(seconds: int, stars: int) -> int:
    base = (20 * 3600 + 4 * seconds) // 3600
    return base * (100 + 5 * (stars - 1)) // 100


def crop_result(crop: dict) -> dict:
    fertilizer = crop.get('fertilizer') or {}
    distribution = probabilities(crop['planting_level'], fertilizer.get('quality_bonus', 0))
    draw, accumulated, stars = roll(crop['random_seed'], 'stars'), 0, 5
    for index, probability in enumerate(distribution):
        accumulated += probability
        if draw < accumulated:
            stars = index + 1
            break
    event_draw = roll(crop['random_seed'], 'event')
    event = 'normal' if event_draw < .9 else 'pests' if event_draw < .95 else 'cold'
    if event == 'cold':
        stars = max(1, stars - 1)
    extra = Decimal(crop['rules']['yield']) * Decimal(str(fertilizer.get('yield_percentage', 0))) / 100
    whole = int(extra)
    extra_quantity = whole + int(roll(crop['random_seed'], 'yield') < float(extra - whole))
    return {'stars': stars, 'event': event, 'event_name': EVENT_NAMES[event],
            'fertilizer_extra': extra_quantity, 'unit_price': unit_value(crop['rules']['sale_price'], stars),
            'experience': experience_for(crop['rules']['growth_seconds'], stars)}


def event_quantity(quantity: int, event: str) -> int:
    return max(1, (quantity * 3 + 3) // 4) if event == 'pests' else quantity


def estimate(rule: dict, level: int, fertilizer: dict | None = None,
             percentage: str = '0', remainder: str = '0') -> dict:
    """Enumerate quality, event and fractional yield; listing premiums are excluded."""
    fertilizer = fertilizer or {}
    distribution = probabilities(level, fertilizer.get('quality_bonus', 0))
    professional = int(Decimal(rule['yield']) * Decimal(percentage) / 100 + Decimal(remainder))
    extra = Decimal(rule['yield']) * Decimal(str(fertilizer.get('yield_percentage', 0))) / 100
    whole, fraction = int(extra), float(extra - int(extra))
    revenue = expected_quantity = 0.0
    for add, weight in ((whole, 1 - fraction), (whole + 1, fraction)):
        quantity = rule['yield'] + professional + add
        expected_quantity += weight * (.95 * quantity + .05 * event_quantity(quantity, 'pests'))
        for index, probability in enumerate(distribution):
            stars = index + 1
            value = unit_value(rule['sale_price'], stars)
            revenue += weight * probability * (.9 * quantity * value +
                .05 * event_quantity(quantity, 'pests') * value +
                .05 * quantity * unit_value(rule['sale_price'], max(1, stars - 1)))
    final_distribution = [.95 * probability for probability in distribution]
    for index, probability in enumerate(distribution):
        final_distribution[max(0, index - 1)] += .05 * probability
    return {'star_probabilities': distribution, 'final_star_probabilities': final_distribution,
            'expected_stars': round(sum((index + 1) * p for index, p in enumerate(final_distribution)), 4),
            'expected_quantity': round(expected_quantity, 4),
            'expected_revenue': round(revenue, 4)}
