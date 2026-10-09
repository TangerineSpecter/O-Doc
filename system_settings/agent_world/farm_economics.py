"""Read-only planting purchase and fertilizer comparisons, using actual hourly quotes."""
from .farm_quality import estimate, skill_progress
from .inventory_stock import stock_quantity, preview_cost
from .market_visibility import visible_supply


def planting_context(farm, rules, quotes: list[dict], bonus: dict, next_refresh_at=None) -> dict:
    skill = skill_progress(farm.state.get('planting_experience', 0))
    prices = {row['sku']: visible_supply(row) for row in quotes}
    fertilizers = {}
    for kind, rule in rules['fertilizers'].items():
        sku = 'fertilizer.' + kind
        quantity = stock_quantity(farm.pk, farm.owner_id, sku)
        fertilizers[kind] = {'quantity': quantity,
            'next_inventory_cost': str(preview_cost(farm.pk, farm.owner_id, sku, 1)) if quantity else None,
            'quote': prices.get(sku)}
    comparisons = []
    for kind, rule in rules['crops'].items():
        remainder = farm.state.get('yield_remainders', {}).get('crop.' + kind, '0')
        base = estimate(rule, skill['level'], percentage=bonus['percentage'], remainder=remainder)
        options = {}
        for fert_kind, fertilizer in rules['fertilizers'].items():
            current = fertilizers[fert_kind]
            quote = current['quote']
            option = estimate(rule, skill['level'], quote or fertilizer, bonus['percentage'], remainder)
            if quote:
                option['additional_net_revenue'] = round(option['expected_revenue'] - base['expected_revenue'] - float(quote['price']), 4)
            if current['next_inventory_cost'] is not None:
                option['inventory_additional_net_revenue'] = round(option['expected_revenue'] - base['expected_revenue'] - float(current['next_inventory_cost']), 4)
            options[fert_kind] = option
        comparisons.append({'sku': 'crop.' + kind, 'name': rule['name'], 'without_fertilizer': base, 'fertilizers': options})
    return {'skill': skill, 'fertilizers': fertilizers, 'crop_comparisons': comparisons, 'next_refresh_at': next_refresh_at,
            'note': '收益包含轻事件，不包含尚未成交的挂牌溢价。现有肥料也有采购成本；允许等待下一次市场机会，但不保证价格下降。'}
