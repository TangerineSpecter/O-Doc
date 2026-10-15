"""Equal-level market intents with bounded previews, followed by complete pages."""

ACTION_TOOLS = {
    'buy': {'buy_market_shop', 'buy_market_listing', 'buy_combat_potion'},
    'sell': {'sell_to_market_shop', 'sell_combat_material', 'sell_combat_equipment'},
    'list': {'create_market_listing'},
    'manage': {'reprice_market_listing', 'withdraw_market_listing'},
}
ACTION_LABELS = {'buy': '购买所需商品', 'sell': '回收出售已有物品',
                 'list': '自主定价上架已有物品，成交后才获得收入',
                 'manage': '管理自己的挂牌：改价或撤回'}
PREVIEW_SIZE = 3


def for_action(rows: list[dict], action: str) -> list[dict]:
    return [row for row in rows if row['tool'] in ACTION_TOOLS[action]]


def action_options(rows: list[dict]) -> dict:
    result = {}
    for action, label in ACTION_LABELS.items():
        available = for_action(rows, action)
        if not available:
            continue
        examples = []
        for row in available[:PREVIEW_SIZE]:
            detail = row['detail']
            source = detail.get('source') or detail.get('item', {}).get('source') or {}
            example = {'label': row['label'], 'maximum': row['maximum']}
            optional = {
                'unit_price': row['unit_price'],
                'recovery_for_one': row.get('recovery', {}).get('1'),
                'recovery_for_maximum': row.get('recovery', {}).get(str(row['maximum'])),
                'current_listing_price': detail.get('unit_price'),
                'quality': source.get('stars', source.get('quality')),
            }
            example.update({key: value for key, value in optional.items() if value is not None})
            examples.append(example)
        result[action] = {'label': label, 'feasible_items': len(available),
                          'examples': examples, 'has_more': len(available) > PREVIEW_SIZE}
    return result
