"""从稳定业务引用补全流水展示，不修改账本快照或金额。"""
from .market_models import MarketTransaction

LABELS = {'buy_shop': '商店购买', 'sell': '商店回收', 'buy_listing': '购买居民商品',
          'list': '居民上架', 'reprice': '调整挂牌价格', 'withdraw': '撤回挂牌'}


def ledger_details(entries, owner=None):
    ids = {entry.snapshot.get('market_transaction_id') for entry in entries
           if entry.kind == 'market' and isinstance(entry.snapshot, dict)} - {None, ''}
    transactions = MarketTransaction.objects.filter(pk__in=ids)
    if owner is not None:
        transactions = transactions.filter(owner_id=owner)
    transactions = {row.pk: row for row in transactions}
    details = {}
    for entry in entries:
        snapshot = entry.snapshot if isinstance(entry.snapshot, dict) else {}
        fallback = next((str(snapshot[key]) for key in ('postTitle', 'post_title', 'title', 'description', 'reason', 'memo', 'code') if snapshot.get(key)), '')
        row = transactions.get(snapshot.get('market_transaction_id')) if entry.kind == 'market' else None
        if row:
            result = row.result if isinstance(row.result, dict) else {}
            operation = row.operation if isinstance(row.operation, dict) else {}
            # 买方与卖方使用同一交易引用，只展示账本对应角色参与的交易。
            participants = {row.actor_id, result.get('seller_id')}
            if entry.agent_id in participants:
                kind = operation.get('kind') or result.get('kind')
                label = '居民商品售出' if entry.agent_id != row.actor_id else LABELS.get(kind, '市场交易')
                name = result.get('name') or operation.get('name')
                quantity = result.get('quantity') or operation.get('quantity')
                price = result.get('unit_price')
                parts = [label]
                if name:
                    parts.append(f'{name} × {quantity}' if quantity else str(name))
                if price is not None:
                    parts.append(f'单价 {price} 世界币')
                fallback = ' · '.join(parts)
        details[entry.pk] = fallback
    return details
