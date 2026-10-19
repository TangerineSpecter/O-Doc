"""Versioned elixir effects shared by alchemy, combat and sync.

效果只在出发时按星级冻结，进入战斗后不再重新计算。
"""
import math
from decimal import Decimal

VERSION = 1
STAR_MULTIPLIERS = ('1', '1.15', '1.3', '1.5', '1.75')

BASE_EFFECTS = {
    'healing': {'hp_restore': .22, 'duration': 0},
    'focus': {'mp_restore': .30, 'duration': 0},
    'iron': {'physical_defense': .25, 'duration': 6},
    'fury': {'physical_attack': .20, 'duration': 6},
    'regen': {'hp_regen': .05, 'duration': 6},
    'arcane': {'magic_attack': .22, 'duration': 6},
    'ember': {'fire_power': .25, 'duration': 6},
    'aegis': {'shield': .28, 'duration': 5},
    'star': {'critical': .15, 'critical_damage': .30, 'duration': 6},
    'purify': {'cleanse': 1, 'immune_duration': 3, 'duration': 3},
}

# 触发条件只依赖当前战斗状态，保证快照恢复后重放一致。
TRIGGERS = {
    'healing': {'kind': 'hp_below', 'value': .35},
    'focus': {'kind': 'mp_below', 'value': .30},
    'iron': {'kind': 'hp_below', 'value': .60},
    'fury': {'kind': 'elite_first'},
    'regen': {'kind': 'hp_below', 'value': .70},
    'arcane': {'kind': 'elite_first'},
    'ember': {'kind': 'elite_first'},
    'aegis': {'kind': 'hp_below', 'value': .60},
    'star': {'kind': 'elite_first'},
    'purify': {'kind': 'debuff_count', 'value': 2},
}

LABELS = {
    'physical_attack': '物理攻击', 'magic_attack': '魔法攻击',
    'physical_defense': '物理防御', 'magic_defense': '魔法防御',
    'critical': '暴击', 'critical_damage': '暴击伤害',
}
ELEMENT_NAMES = {'water': '水', 'fire': '火', 'earth': '土', 'wind': '风', 'light': '光', 'dark': '暗'}


def _ratio(value) -> str:
    return format(Decimal(str(value)) * 100, 'f').rstrip('0').rstrip('.')


def effects_for(recipe_id: str, stars: int, version: int = VERSION) -> dict:
    if (type(version) is not int or version != VERSION or recipe_id not in BASE_EFFECTS or
            type(stars) is not int or not 1 <= stars <= 5):
        raise ValueError('炼金效果版本、配方或星级无效')
    multiplier = Decimal(STAR_MULTIPLIERS[stars - 1])
    result = {}
    for key, value in BASE_EFFECTS[recipe_id].items():
        if key in ('duration', 'immune_duration'):
            result[key] = int(value)
        elif key == 'cleanse':
            result[key] = int(value)
        else:
            result[key] = float((Decimal(str(value)) * multiplier).quantize(Decimal('.0001')))
    return result


def describe(effects: dict) -> str:
    parts = []
    for key, value in effects.items():
        if key in ('duration', 'immune_duration'):
            continue
        if key == 'cleanse':
            parts.append('清除全部负面状态')
            continue
        if key == 'hp_restore':
            parts.append(f'立即恢复最大生命{_ratio(value)}%')
            continue
        if key == 'mp_restore':
            parts.append(f'立即恢复最大法力{_ratio(value)}%')
            continue
        if key == 'hp_regen':
            parts.append(f'每回合恢复最大生命{_ratio(value)}%')
            continue
        if key == 'shield':
            parts.append(f'护盾吸收最大生命{_ratio(value)}%')
            continue
        if key in LABELS:
            percent = _ratio(value)
            if key in ('critical',):
                parts.append(f'{LABELS[key]}+{percent}%')
            else:
                parts.append(f'{LABELS[key]}+{percent}%')
            continue
        if key.endswith('_power'):
            parts.append(f'{ELEMENT_NAMES[key[:-6]]}属性强化+{_ratio(value)}个百分点')
            continue
        if key.endswith('_resist'):
            parts.append(f'{ELEMENT_NAMES[key[:-7]]}属性抗性+{_ratio(value)}个百分点')
            continue
    duration = int(effects.get('duration') or 0)
    if duration:
        parts.append(f'持续{duration}回合')
    immune = int(effects.get('immune_duration') or 0)
    if immune:
        parts.append(f'{immune}回合免疫新增负面')
    return '；'.join(parts)


def previews(recipe_id: str) -> list[dict]:
    return [{'stars': stars, 'effects': effects_for(recipe_id, stars),
             'summary': describe(effects_for(recipe_id, stars))} for stars in range(1, 6)]


def validate_carried(entries: list, cap: int) -> list[dict]:
    if entries is None:
        return []
    if not isinstance(entries, list) or len(entries) > cap:
        raise ValueError('携带炼金药水格式无效')
    seen, total = set(), 0
    result = []
    for row in entries:
        if not isinstance(row, dict) or set(row) != {'recipe_id', 'stars', 'count'}:
            raise ValueError('携带炼金药水格式无效')
        recipe_id, stars, count = row['recipe_id'], row['stars'], row['count']
        if recipe_id not in BASE_EFFECTS or type(stars) is not int or not 1 <= stars <= 5:
            raise ValueError('携带炼金药水配方或星级无效')
        if type(count) is not int or not 1 <= count <= cap:
            raise ValueError('携带炼金药水数量无效')
        key = (recipe_id, stars)
        if key in seen:
            raise ValueError('携带炼金药水重复')
        seen.add(key)
        total += count
        result.append({'recipe_id': recipe_id, 'stars': stars, 'count': count})
    if total > cap:
        raise ValueError(f'每次最多携带 {cap} 瓶炼金药水')
    return result


def heal_amount(ratio, maximum: int) -> int:
    """Percent healing always restores at least one point, never above maximum."""
    return max(1, math.floor(Decimal(str(maximum)) * Decimal(str(ratio))))
