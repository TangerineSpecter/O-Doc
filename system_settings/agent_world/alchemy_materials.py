"""Read-only FIFO allocation and exact consumption of maze materials."""
from decimal import Decimal
from django.db import transaction
from .inventory_stock import inventory_items


def material_pool(actor_id: str, owner: str) -> list[dict]:
    result = []
    for row in inventory_items(actor_id, owner):
        sku = row.source.get('sku', '')
        if not sku.startswith('combat.material.'):
            continue
        result.append({'inventory_id': row.pk, 'sku': sku, 'quantity': row.quantity,
                       'price': str(row.value), 'created_at': row.created_at.isoformat()})
    return result


def allocate(pool: list[dict], ingredients: list[dict]) -> list[dict]:
    """Consumes only the supplied simulation pool, preserving stock identity and FIFO."""
    allocations = []
    for ingredient in ingredients:
        remaining = ingredient['quantity']
        rows = [row for row in pool if row['sku'] == ingredient['sku']]
        rows.sort(key=lambda row: (row['created_at'], row['inventory_id']))
        for row in rows:
            used = min(remaining, row['quantity'])
            if not used:
                continue
            allocations.append({'inventory_id': row['inventory_id'], 'sku': row['sku'],
                                'quantity': used, 'price': row['price']})
            row['quantity'] -= used
            remaining -= used
        if remaining:
            raise ValueError('迷宫素材不足，制作计划材料冲突')
    return allocations


@transaction.atomic
def consume(actor_id: str, owner: str, materials: list[dict]) -> Decimal:
    from .travel_models import AgentInventoryItem
    rows = {row.pk: row for row in AgentInventoryItem.objects.select_for_update().filter(
        actor_id=actor_id, owner_id=owner, pk__in=[row['inventory_id'] for row in materials])}
    amount = Decimal(0)
    for allocation in materials:
        row = rows.get(allocation['inventory_id'])
        if (not row or row.source.get('sku') != allocation['sku'] or
                row.quantity < allocation['quantity'] or Decimal(str(row.value)) != Decimal(str(allocation['price']))):
            raise ValueError('已确认炼金材料发生变化')
        amount += Decimal(str(allocation['price'])) * allocation['quantity']
        row.quantity -= allocation['quantity']
        if row.quantity:
            row.save(update_fields=['quantity'])
        else:
            row.delete()
    return amount
