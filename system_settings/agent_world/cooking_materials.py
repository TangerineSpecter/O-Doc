"""Read-only FIFO allocation and exact consumption of confirmed cooking materials."""
import copy
from decimal import Decimal
from django.db import transaction
from .inventory_stock import inventory_items
from .cooking_quality import STRATEGIES


def material_pool(actor_id: str, owner: str) -> list[dict]:
    result = []
    for row in inventory_items(actor_id, owner):
        if not row.source.get('sku', '').startswith(('crop.', 'product.')):
            continue
        lots = copy.deepcopy(row.source.get('lots') or [{'quantity': row.quantity, 'price': str(row.value)}])
        if sum(lot['quantity'] for lot in lots) != row.quantity:
            raise ValueError('库存价格批次不一致')
        result.append({'inventory_id': row.pk, 'sku': row.source['sku'],
                       'stars': row.source.get('stars', 1) if row.source['sku'].startswith('crop.') else 1,
                       'created_at': row.created_at.isoformat(), 'quantity': row.quantity, 'lots': lots})
    return result


def split_lots(lots: list[dict], quantity: int) -> tuple[list[dict], list[dict]]:
    taken, kept, needed = [], [], quantity
    for lot in lots:
        count = min(needed, lot['quantity'])
        if count:
            taken.append({'quantity': count, 'price': str(lot['price'])})
        if lot['quantity'] > count:
            kept.append({**lot, 'quantity': lot['quantity'] - count})
        needed -= count
    if needed:
        raise ValueError('库存批次不足')
    return taken, kept


def allocate(pool: list[dict], ingredients: list[dict], strategy: str) -> list[dict]:
    """Consumes only the supplied simulation pool, preserving stock identity and FIFO."""
    if strategy not in STRATEGIES:
        raise ValueError('材料策略无效')
    allocations = []
    for ingredient in ingredients:
        remaining = ingredient['quantity']
        rows = [row for row in pool if row['sku'] == ingredient['sku']]
        rows.sort(key=lambda row: ((-1 if strategy == 'high_stars_first' else 1) * row['stars'], row['created_at'], row['inventory_id']))
        for row in rows:
            used = min(remaining, row['quantity'])
            if not used:
                continue
            taken, kept = split_lots(row['lots'], used)
            allocations.append({'inventory_id': row['inventory_id'], 'sku': row['sku'],
                                'stars': row['stars'], 'quantity': used, 'lots': taken})
            row['quantity'] -= used
            row['lots'] = kept
            remaining -= used
        if remaining:
            raise ValueError('库存不足，制作计划材料冲突')
    return allocations


@transaction.atomic
def consume(actor_id: str, owner: str, materials: list[dict]) -> Decimal:
    from .travel_models import AgentInventoryItem
    rows = {row.pk: row for row in AgentInventoryItem.objects.select_for_update().filter(
        actor_id=actor_id, owner_id=owner, pk__in=[row['inventory_id'] for row in materials])}
    amount = Decimal(0)
    for allocation in materials:
        row = rows.get(allocation['inventory_id'])
        if (not row or row.source.get('sku') != allocation['sku'] or row.quantity < allocation['quantity'] or
                (row.source.get('stars', 1) if allocation['sku'].startswith('crop.') else 1) != allocation['stars']):
            raise ValueError('已确认制作材料发生变化')
        lots = row.source.get('lots') or [{'quantity': row.quantity, 'price': str(row.value)}]
        if sum(lot['quantity'] for lot in lots) != row.quantity:
            raise ValueError('库存批次不一致')
        taken, kept = split_lots(lots, allocation['quantity'])
        if taken != allocation['lots']:
            raise ValueError('已确认制作材料批次发生变化')
        amount += sum((Decimal(lot['price']) * lot['quantity'] for lot in taken), Decimal(0))
        row.quantity -= allocation['quantity']
        if row.quantity:
            row.source = {**row.source, 'lots': kept}
            row.value = Decimal(kept[0]['price'])
            row.save(update_fields=['quantity', 'source', 'value'])
        else:
            row.delete()
    return amount
