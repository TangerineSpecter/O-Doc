"""Versioned food bonuses. Pure rules shared by cooking, combat and sync."""
import math
from decimal import Decimal

VERSION = 1
STAR_MULTIPLIERS = ('1', '1.2', '1.5', '1.8', '2.2')
BASE_EFFECTS = {
    'baked_potato': {'physical_attack': .06},
    'smashed_cucumber': {'physical_defense': .06},
    'roasted_corn': {'magic_attack': .06},
    'radish_stir_fry': {'magic_defense': .06},
    'tomato_eggs': {'hp_recovery': .01},
    'peanut_soymilk': {'mp_recovery': .01},
    'spiced_peanuts': {'earth_power': .06},
    'pumpkin_soup': {'earth_resist': .06},
    'garden_fried_rice': {'wind_power': .06},
    'cabbage_stir_fry': {'wind_resist': .06},
    'spicy_eggplant': {'fire_power': .06},
    'onion_pancake': {'fire_resist': .06},
    'strawberry_pudding': {'water_power': .06},
    'strawberry_cake': {'water_resist': .06},
    'eggplant_rice': {'dark_power': .06},
    'vegetable_rice': {'dark_resist': .06},
    'milk_corn_cake': {'light_power': .06},
    'sunflower_crisp': {'light_resist': .06},
    'pumpkin_pie': {'hp_recovery': .006, 'mp_recovery': .006},
    'harvest_platter': {key: .03 for key in
                        ('physical_attack', 'magic_attack', 'physical_defense', 'magic_defense')},
}
LABELS = {'physical_attack': '物理攻击', 'magic_attack': '魔法攻击',
          'physical_defense': '物理防御', 'magic_defense': '魔法防御'}
ELEMENT_NAMES = {'water': '水', 'fire': '火', 'earth': '土', 'wind': '风', 'light': '光', 'dark': '暗'}


def portions(duration: int) -> int:
    if type(duration) is not int or duration not in (1800, 3600, 7200):
        raise ValueError('美食覆盖时长无效')
    return duration // 1800


def effects_for(recipe_id: str, stars: int, version: int = VERSION) -> dict:
    if (type(version) is not int or version != VERSION or recipe_id not in BASE_EFFECTS or
            type(stars) is not int or not 1 <= stars <= 5):
        raise ValueError('美食效果版本、菜谱或星级无效')
    multiplier = Decimal(STAR_MULTIPLIERS[stars - 1])
    return {key: float(Decimal(str(value)) * multiplier) for key, value in BASE_EFFECTS[recipe_id].items()}


def describe(effects: dict) -> str:
    parts = []
    for key, value in effects.items():
        percentage = format(Decimal(str(value)) * 100, 'f').rstrip('0').rstrip('.')
        if key in LABELS:
            parts.append(f'{LABELS[key]}+{percentage}%')
        elif key in ('hp_recovery', 'mp_recovery'):
            resource = '生命' if key == 'hp_recovery' else '法力'
            parts.append(f'每战斗回合恢复最大{resource}{percentage}%')
        else:
            element, kind = key.rsplit('_', 1)
            label = '强化' if kind == 'power' else '抗性'
            parts.append(f'{ELEMENT_NAMES[element]}属性{label}+{percentage}个百分点')
    return '；'.join(parts)


def previews(recipe_id: str) -> list[dict]:
    return [{'stars': stars, 'effects': effects_for(recipe_id, stars),
             'summary': describe(effects_for(recipe_id, stars))} for stars in range(1, 6)]


def validate_selection(food, duration: int) -> dict | None:
    if food is None:
        return None
    if not isinstance(food, dict) or set(food) != {'recipe_id', 'stars', 'quantity'}:
        raise ValueError('美食选择格式无效')
    effects_for(food['recipe_id'], food['stars'])
    if type(food['quantity']) is not int or food['quantity'] != portions(duration):
        raise ValueError('美食数量与冒险时长不一致')
    return dict(food)


def recover(entity: dict, food: dict | None) -> list[dict]:
    """Called only for a living fighter in an active combat round."""
    if not food or entity['hp'] <= 0:
        return []
    events = []
    for field in ('hp', 'mp'):
        ratio = food['effects'].get(field + '_recovery', 0)
        maximum = entity['stats'][field + '_max']
        before = entity[field]
        if ratio <= 0 or before >= maximum:
            continue
        amount = max(1, math.floor(Decimal(str(maximum)) * Decimal(str(ratio))))
        entity[field] = min(maximum, before + amount)
        events.append({'actor': entity['name'], 'action': food['name'] + ('·恢复生命' if field == 'hp' else '·恢复法力'),
                       'kind': 'passive_recovery', 'healing' if field == 'hp' else 'restored': entity[field] - before})
    return events
