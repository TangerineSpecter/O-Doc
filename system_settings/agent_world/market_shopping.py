"""Shopping facts for models; production estimates stay in the farm domain."""

SEED_GUIDANCE = '农地暂时种满不妨碍提前备种。种子不足时，可结合成熟情况、经营偏好和预算为下一轮少量补货；备种参考量不是购买要求，是否买、买哪种和多少由居民决定。没有当天播种安排只表示不调整安排，不限制采购。'


def farm_summary(context: dict) -> dict | None:
    farm = context.get('farm')
    if not farm:
        return None
    crops = [plot['crop'] for plot in farm['plots'] if plot.get('crop')]
    seeds = sum(row['quantity'] for row in context['inventory']
                if row['source'].get('sku', '').startswith('seed.'))
    return {'plots': len(farm['plots']), 'empty_plots': len(farm['plots']) - len(crops),
            'harvest_ready': sum(crop['grown'] >= crop['rules']['growth_seconds'] for crop in crops),
            'seed_quantity': seeds, 'next_round_seed_reference': max(0, len(farm['plots']) - seeds),
            'buildings': farm['buildings'], 'animals': len(farm['animals'])}


def planting_summary(planting: dict) -> dict:
    return {'fertilizers': {kind: {'quantity': row['quantity'], 'quote': row.get('quote')}
                           for kind, row in planting.get('fertilizers', {}).items()},
            'next_refresh_at': planting.get('next_refresh_at')}


def seed_inventory(planting: dict) -> list[dict]:
    return [{'sku': row['seed_sku'], 'name': row['name'] + '种子', 'quantity': row['seed_quantity']}
            for row in planting.get('crop_comparisons', [])]


def purchase_detail(product: dict, context: dict) -> dict:
    sku = product['sku']
    detail = {'sku': sku, 'kind': product.get('kind'),
              'owned': sum(row['quantity'] for row in context['inventory']
                           if row['source'].get('sku') == sku)}
    if sku.startswith('seed.'):
        detail['effect'] = '用于种植' + product['name'].removesuffix('种子')
        farm = farm_summary(context)
        if farm:
            detail['next_round_seed_reference'] = farm['next_round_seed_reference']
    elif sku.startswith('fertilizer.'):
        detail['effect'] = '提高作物品质' if sku == 'fertilizer.quality' else '提高作物产量'
        detail.update({key: product[key] for key in ('quality_bonus', 'yield_percentage', 'version')
                       if key in product})
    elif sku.startswith('animal.'):
        animals = (context.get('farm') or {}).get('animals', [])
        detail['owned'] = sum(animal['kind'] == sku.removeprefix('animal.') for animal in animals)
        detail.update({key: product['rules'][key] for key in ('building', 'product', 'period_seconds')})
    elif sku == 'feed':
        detail['effect'] = '用于喂养动物'
    return detail
