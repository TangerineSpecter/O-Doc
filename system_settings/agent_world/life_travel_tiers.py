"""Bounded travel budget questions; fine amounts preserve the existing 1000 step."""
from decimal import Decimal, ROUND_CEILING

FINE_OPTIONS = 12
RANGE_OPTIONS = 4
SKIP = {'label': '不去', 'budget': '0'}


def covering_tier(price: Decimal) -> Decimal:
    if price <= 500:
        return Decimal(500)
    return Decimal(500) + ((price - 500) / 1000).to_integral_value(rounding=ROUND_CEILING) * 1000


def budget_options(maximum: Decimal, available: Decimal, *, minimum=Decimal(0), first=0, last=None) -> dict:
    result = {'skip': dict(SKIP)}
    if available <= 0 or maximum < minimum:
        return result
    ceiling = covering_tier(maximum)
    upper = int((ceiling - 500) / 1000)
    first = max(first, 0, int(((minimum - 500) / 1000).to_integral_value(rounding=ROUND_CEILING)))
    last = min(upper, last if last is not None else upper)
    if first > last:
        return result
    def amount(index):
        return min(Decimal(500) + index * 1000, available)
    count = last - first + 1
    if count <= FINE_OPTIONS:
        for index in range(first, last + 1):
            cap = amount(index)
            if cap > 0 and cap >= minimum:
                result[f'cap_{cap}'] = {'label': f'旅行预算上限 {cap} 世界币', 'budget': str(cap)}
    else:
        # Partition by index without materializing the entire fine-grained list.
        width = (count + RANGE_OPTIONS - 1) // RANGE_OPTIONS
        for start in range(first, last + 1, width):
            end = min(last, start + width - 1)
            result[f'range_{start}_{end}'] = {
                'label': f'预算上限区间 {amount(start)}～{amount(end)} 世界币',
                'minimum': str(amount(start)), 'maximum': str(amount(end)),
            }
    return result


def select_budget(maximum, available, minimum, select):
    """Return (explicit cap or None, quote ceiling). Failure never widens a chosen range."""
    first, last = 0, None
    quote_ceiling = min(available, covering_tier(maximum))
    while True:
        choices = budget_options(maximum, available, minimum=minimum, first=first, last=last)
        if len(choices) == 1:
            return None, Decimal(0)
        selected = select(choices)
        if selected == 'skip':
            return 'skip', Decimal(0)
        if selected not in choices:
            return None, quote_ceiling
        if selected.startswith('cap_'):
            return choices[selected]['budget'], quote_ceiling
        _, start, end = selected.split('_')
        first, last = int(start), int(end)
        quote_ceiling = Decimal(choices[selected]['maximum'])
