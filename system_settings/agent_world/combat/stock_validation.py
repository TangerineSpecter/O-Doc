"""Reconcile combat stock with all retained inventory-changing business facts."""
from collections import Counter

PREFIX = 'system_settings.'


def stock_changes(row: dict, balance: Counter) -> None:
    payload, kind = row['payload'], row['kind']
    if kind == 'depart':
        balance.subtract({'combat.' + key: count for key, count in payload['plan'].get('potions', {}).items()})
    elif kind == 'terminal':
        balance.update({'combat.' + key: count for key, count in payload['returned'].items()})
    elif kind == 'round':
        for event in payload.get('events', []):
            if event['kind'] == 'kill':
                for reward in event['rewards']:
                    if reward['kind'] != 'equipment':
                        balance['combat.' + reward['item']['id']] += reward['quantity']
    elif kind == 'trade':
        operation = payload['arguments']
        if operation['kind'] == 'buy_potion':
            balance['combat.' + operation['potion_id']] += operation['quantity']
        elif operation['kind'] == 'sell_combat_material':
            balance['combat.' + operation['material_id']] -= operation['quantity']
    elif kind == 'forge':
        for material in payload['materials']:
            balance[material['sku']] -= material['quantity']


def expected_stock(rows: dict, actor: str, owner: str, facts: list[dict]) -> Counter:
    from utils.sync_manager import SyncError

    balance = Counter()
    # The full hash-verified chain is retained even after sealing. Counting quantities
    # needs no historical catalog and avoids counting pre-checkpoint external trades twice.
    for fact in facts:
        stock_changes(fact, balance)
    for (model, _), row in rows.items():
        if row.get('actor_id') != actor:
            continue
        if model == PREFIX + 'alchemyoperation':
            if row['owner_id'] != owner:
                raise SyncError('炼金材料消费归属不一致')
            for material in row['snapshot']['materials']:
                sku, quantity = material['sku'], material['quantity']
                if not sku.startswith('combat.material.') or type(quantity) is not int or quantity < 1:
                    raise SyncError('炼金材料消费数量或来源无效')
                balance[sku] -= quantity
        elif model == PREFIX + 'markettransaction':
            operation, result = row['operation'], row['result']
            kind = operation['kind']
            if kind not in ('list', 'buy_listing', 'withdraw'):
                continue
            listing_id = result.get('listing_id') if kind == 'list' else operation.get('listing_id')
            listing = rows.get((PREFIX + 'marketlisting', listing_id))
            if not listing:
                raise SyncError('库存交易缺少挂牌来源')
            sku = listing['item'].get('source', {}).get('sku', '')
            if not sku.startswith('combat.material.'):
                continue
            quantity = result.get('quantity')
            if (row['owner_id'] != owner or listing['owner_id'] != owner
                    or (kind != 'buy_listing' and listing['seller_id'] != actor)
                    or (kind == 'buy_listing' and listing['seller_id'] == actor)
                    or type(quantity) is not int or quantity < 1
                    or (kind != 'withdraw' and quantity != operation.get('quantity'))
                    or (kind == 'list' and quantity != listing['initial_quantity'])):
                raise SyncError('迷宫材料交易归属或数量不一致')
            balance[sku] += -quantity if kind == 'list' else quantity
    return balance
