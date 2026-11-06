"""Versioned finite retention targets; no database access or inventory mutation."""
from datetime import date

VERSION = 1
PURPOSES = ('alchemy', 'cooking', 'self_use')
ORDERS = ('high', 'low')


def validate(strategy: dict, *, sell_ratio: int, list_ratio: int) -> dict:
    if not isinstance(strategy, dict) or type(strategy.get('version')) is not int or strategy.get('version') != VERSION:
        raise ValueError('库存策略版本无效或过新')
    targets = strategy.get('targets')
    if (not isinstance(targets, dict) or not targets or set(targets) - set(PURPOSES)
            or any(type(n) is not int or not 0 <= n <= 1000000 for n in targets.values())
            or strategy.get('retain_order') not in ORDERS):
        raise ValueError('库存用途目标或保留顺序无效')
    try:
        if date.fromisoformat(strategy['reviewed_date']).isoformat() != strategy['reviewed_date']:
            raise ValueError('日期必须为YYYY-MM-DD')
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError('库存策略复核日期无效') from exc
    if (type(sell_ratio) is not int or type(list_ratio) is not int
            or not 0 <= sell_ratio <= 100 or not 0 <= list_ratio <= 100
            or sell_ratio + list_ratio != 100):
        raise ValueError('超量出售与挂牌比例合计必须为100%')
    return strategy


def is_current(policy) -> bool:
    if not policy or not policy.strategy:
        return False
    try:
        validate(policy.strategy, sell_ratio=policy.sell_ratio, list_ratio=policy.list_ratio)
        return True
    except ValueError:
        return False


def purposes(sku: str) -> tuple[str, ...]:
    if sku.startswith('combat.material.'):
        return ('alchemy',)
    if sku.startswith(('crop.', 'product.')):
        return ('cooking',)
    return ('self_use',)


def quantity_choices(sku: str, unit: int, previous: int | None = None) -> dict[str, str]:
    values = ({0, unit, 3 * unit, 5 * unit, 10 * unit} if unit else
              {0, 1} if sku.startswith('souvenir.') else {0, 1, 3, 5, 10, 20})
    if previous is not None:
        values.add(previous)
    return {str(n): f'保留 {n} 件' for n in sorted(values) if 0 <= n <= 1000000}


class RetentionChanged(ValueError):
    """A prechecked disposal is no longer executable; retry at the next hourly check."""
