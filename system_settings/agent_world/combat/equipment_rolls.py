"""Level/quality budgets for new equipment rolls, independent of storage and RNG."""
from collections.abc import Mapping
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

# Quality changes both the intrinsic gear budget and each rolled affix budget.
_BASE_QUALITY = {'white': Decimal('1'), 'blue': Decimal('1.15'), 'gold': Decimal('1.30')}
_EARLY_BASE = {'white': Decimal('0'), 'blue': Decimal('0.25'), 'gold': Decimal('0.55')}
_EARLY_LEVEL = 50
QUALITIES = tuple(_BASE_QUALITY)
_FLAT_QUALITY = {'white': Decimal('1'), 'blue': Decimal('1.6'), 'gold': Decimal('2.4')}
_RATIO_QUALITY = {'white': Decimal('1'), 'blue': Decimal('1.25'), 'gold': Decimal('1.5')}


def quality_base(value: int, quality: str, level: int) -> int:
    """Early levels keep a larger quality share; the extra fades out by level 50."""
    if not 1 <= level <= 99:
        raise ValueError('装备等级须为 1 至 99')
    extra = _EARLY_BASE[quality] * max(Decimal('0'), Decimal('1') - Decimal(level) / _EARLY_LEVEL)
    return int(Decimal(value) * (_BASE_QUALITY[quality] + extra))


def affix_range(definition: Mapping[str, str], level: int, quality: str) -> tuple[int | float, int | float]:
    """Keep early flat budgets small; quadratic scaling restores late-game relevance.

    Ratios use a separate bounded curve to avoid multiplying six-slot crit/evasion
    by the large flat-stat multiplier. Bounds match the discrete sampling grid.
    """
    if not 1 <= level <= 99:
        raise ValueError('装备等级须为 1 至 99')
    progress = Decimal(level - 1) / Decimal(98)
    bounds = []
    for side in ('min', 'max'):
        growth = Decimal(definition[f'{side}_growth']) * level
        if definition['unit'] == 'integer':
            growth = growth.to_integral_value(rounding=ROUND_CEILING)
        bounds.append(Decimal(definition[f'{side}_base']) + growth)
    if definition['unit'] == 'integer':
        multiplier = (1 + 5 * progress * progress) * _FLAT_QUALITY[quality]
        low, high = (int((bound * multiplier).to_integral_value(rounding=ROUND_CEILING)) for bound in bounds)
        return low, high
    if definition['unit'] == 'ratio':
        multiplier = (Decimal('.5') + Decimal('.5') * progress) * _RATIO_QUALITY[quality]
        low, high = (float((bound * multiplier).quantize(Decimal('.0001'), rounding=ROUND_HALF_UP)) for bound in bounds)
        return low, high
    raise ValueError('未知词条数值单位')
