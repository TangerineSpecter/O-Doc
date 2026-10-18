"""Deterministic affix imagery; naming never consumes the loot RNG."""
from collections.abc import Mapping, Sequence

# Stable affix IDs, never localized labels or raw values with different units.
_SINGLE = {
    'strength': '强壮', 'dexterity': '轻盈', 'intelligence': '睿智',
    'vitality': '旺盛', 'spirit': '澄明', 'luck': '幸运',
    'physical_attack': '锋锐', 'magic_attack': '微光',
    'hp_max': '丰盈', 'mp_max': '充盈', 'physical_defense': '坚固',
    'magic_defense': '辟魔', 'healing': '复苏', 'critical': '致命',
    'critical_damage': '残忍', 'accuracy': '精准', 'evasion': '灵巧',
    'water_power': '潮涌', 'fire_power': '炽炎', 'earth_power': '磐岩',
    'wind_power': '疾风', 'light_power': '圣辉', 'dark_power': '幽影',
    'water_resist': '避潮', 'fire_resist': '耐火', 'earth_resist': '固土',
    'wind_resist': '稳风', 'light_resist': '承光', 'dark_resist': '御暗',
}
_GROUPS = {
    'power': ('strength', 'physical_attack', 'critical', 'critical_damage'),
    'magic': ('intelligence', 'spirit', 'magic_attack', 'mp_max', 'healing'),
    'guard': ('vitality', 'hp_max', 'physical_defense', 'magic_defense'),
    'agility': ('dexterity', 'accuracy', 'evasion'),
    'fortune': ('luck',),
    'element': ('water_power', 'fire_power', 'earth_power', 'wind_power', 'light_power', 'dark_power',
                'water_resist', 'fire_resist', 'earth_resist', 'wind_resist', 'light_resist', 'dark_resist'),
}
_GROUP_BY_ID = {f'affix.{stat}': group for group, stats in _GROUPS.items() for stat in stats}

# Multiple combinations may share an image word, rather than a profession title.
_SAME_GROUP = {
    'power': ('凶猛', '残暴'), 'magic': ('辉耀', '深邃'),
    'guard': ('厚重', '坚毅'), 'agility': ('迅捷', '无踪'),
    'fortune': ('吉祥', '鸿运'),
    'element': ('蕴灵', '元素'),
}
_MIXED = {
    frozenset(('power', 'magic')): ('秘锋', '幻锋'),
    frozenset(('power', 'guard')): ('刚劲', '雄浑'),
    frozenset(('power', 'agility')): ('凌厉', '迅猛'),
    frozenset(('power', 'fortune')): ('锐光', '耀锋'),
    frozenset(('magic', 'guard')): ('静谧', '永固'),
    frozenset(('magic', 'agility')): ('流光', '幻影'),
    frozenset(('magic', 'fortune')): ('星辉', '璀璨'),
    frozenset(('guard', 'agility')): ('柔韧', '稳健'),
    frozenset(('guard', 'fortune')): ('祥瑞', '庇佑'),
    frozenset(('agility', 'fortune')): ('灵动', '隐风'),
    frozenset(('power', 'magic', 'guard')): ('苍古',),
    frozenset(('power', 'magic', 'agility')): ('凌光',),
    frozenset(('power', 'magic', 'fortune')): ('虹光',),
    frozenset(('power', 'guard', 'agility')): ('坚韧',),
    frozenset(('power', 'guard', 'fortune')): ('雄耀',),
    frozenset(('power', 'agility', 'fortune')): ('惊鸿',),
    frozenset(('magic', 'guard', 'agility')): ('幽静',),
    frozenset(('magic', 'guard', 'fortune')): ('皎洁',),
    frozenset(('magic', 'agility', 'fortune')): ('星影',),
    frozenset(('guard', 'agility', 'fortune')): ('安宁',),
    frozenset(('power', 'element')): ('焰锋', '灵锋'),
    frozenset(('magic', 'element')): ('灵辉', '秘辉'),
    frozenset(('guard', 'element')): ('灵甲', '固灵'),
    frozenset(('agility', 'element')): ('灵风', '迅灵'),
    frozenset(('fortune', 'element')): ('灵运', '瑞灵'),
    frozenset(('power', 'magic', 'element')): ('灵威',),
    frozenset(('power', 'guard', 'element')): ('灵垒',),
    frozenset(('power', 'agility', 'element')): ('灵迅',),
    frozenset(('power', 'fortune', 'element')): ('灵兆',),
    frozenset(('magic', 'guard', 'element')): ('灵护',),
    frozenset(('magic', 'agility', 'element')): ('灵影',),
    frozenset(('magic', 'fortune', 'element')): ('灵星',),
    frozenset(('guard', 'agility', 'element')): ('灵韧',),
    frozenset(('guard', 'fortune', 'element')): ('灵佑',),
    frozenset(('agility', 'fortune', 'element')): ('灵隐',),
}

def _key(*stats: str) -> tuple[str, ...]:
    return tuple(sorted(f'affix.{stat}' for stat in stats))

# Recognizable combinations take precedence over the shared imagery vocabulary.
_COMBINATIONS = {
    _key('strength', 'physical_attack'): '凶猛',
    _key('critical', 'critical_damage'): '残忍',
    _key('dexterity', 'evasion'): '隐风',
    _key('intelligence', 'magic_attack'): '辉耀',
    _key('spirit', 'healing'): '复苏',
    _key('physical_defense', 'magic_defense'): '坚固',
    _key('vitality', 'hp_max'): '丰盈',
    _key('intelligence', 'magic_attack', 'mp_max'): '辉耀',
    _key('hp_max', 'physical_defense', 'magic_defense'): '不破',
    _key('strength', 'physical_attack', 'critical'): '残暴',
    _key('physical_attack', 'critical', 'critical_damage'): '残忍',
    _key('dexterity', 'critical', 'evasion'): '隐风',
    _key('dexterity', 'accuracy', 'evasion'): '无踪',
    _key('spirit', 'healing', 'mp_max'): '复苏',
    _key('vitality', 'hp_max', 'healing'): '长青',
}


def equipment_name(template: Mapping[str, str], affixes: Sequence[Mapping[str, object]],
                   *, starter: bool = False, level: int = 1) -> str:
    """Name new ordinary drops only; existing snapshots and unique names stay intact."""
    base = template['name']
    if starter:
        return '训练木剑' if level == 1 else base
    if template.get('boss_only') == '1' or not affixes:
        return base
    ids = tuple(sorted({str(affix['id']) for affix in affixes}))
    prefix = _COMBINATIONS.get(ids)
    if not prefix and len(ids) == 1:
        prefix = _SINGLE.get(ids[0].removeprefix('affix.'))
    if not prefix:
        groups = frozenset(_GROUP_BY_ID[identity] for identity in ids if identity in _GROUP_BY_ID)
        if len(groups) == 1:
            prefix = _SAME_GROUP[next(iter(groups))][min(max(len(ids) - 2, 0), 1)]
        elif groups in _MIXED:
            choices = _MIXED[groups]
            prefix = choices[min(max(len(ids) - 2, 0), len(choices) - 1)]
    # Future/custom affixes still get a stable name without inventing an effect.
    return f'{prefix or "奇异"}的{base}'
