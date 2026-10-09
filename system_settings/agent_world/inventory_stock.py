"""角色共用背包：按商品 SKU 使用物品，不限定物品 ID、来源或业务类型。"""
import hashlib
import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum, Q
from .travel_models import AgentInventoryItem
from .farm_gate import guarded


def inventory_items(actor_id: str, owner_id: str):
    return AgentInventoryItem.objects.filter(actor_id=actor_id, owner_id=owner_id).order_by('created_at', 'id')


def stock_rows(actor_id: str, owner_id: str, sku: str):
    return inventory_items(actor_id, owner_id).filter(source__sku=sku)


def stock_quantity(actor_id: str, owner_id: str, sku: str) -> int:
    return stock_rows(actor_id, owner_id, sku).aggregate(total=Sum('quantity'))['total'] or 0


@guarded
@transaction.atomic
def add_stock(actor_id: str, owner_id: str, actor_name: str, sku: str, quantity: int,
              name: str, kind: str, price=0, operation_id: str = '', *, stars: int = 1):
    # 有多条来源记录时追加到最后一条，避免新产物排在其他旧批次之前被消费。
    if sku.startswith('crop.'):
        from .farm_quality import unit_value
        unit_value(1, stars)
    rows = stock_rows(actor_id, owner_id, sku).select_for_update()
    if sku.startswith('crop.'):
        rows = rows.filter(source__stars=stars) if stars != 1 else rows.filter(
            Q(source__stars=1) |
            Q(source__stars__isnull=True))
    row = rows.last()
    # Newly produced goods must not inherit a traded item's original owner.
    separate_origin = bool(row and row.origin_actor_id and row.origin_actor_id != actor_id)
    if separate_origin:
        row = None
    if row:
        if sku.startswith(('crop.', 'product.', 'dish.', 'fertilizer.')):
            source = dict(row.source)
            lots = source.get('lots') or [{'quantity': row.quantity, 'price': str(row.value)}]
            row.source = {**source, 'lots': [*lots, {'quantity': quantity, 'price': str(price)}]}
        row.quantity += quantity
        row.save(update_fields=['quantity', 'source'])
        return row
    return AgentInventoryItem.objects.create(
        pk=uuid.uuid4().hex if separate_origin else hashlib.sha256((f'inventory:{owner_id}:{actor_id}:{sku}' + (f':stars:{stars}' if sku.startswith('crop.') and stars != 1 else '')).encode()).hexdigest(),
        actor_id=actor_id, owner_id=owner_id, actor_name=actor_name,
        origin_actor_id=actor_id, origin_actor_name=actor_name,
        name=name, kind=kind, quantity=quantity, value=price,
        rarity='rare' if sku.endswith('.gold') else 'common',
        source={'sku': sku, 'operation_id': operation_id, 'quality': 'gold' if sku.endswith('.gold') else 'normal',
                **({'stars': stars} if sku.startswith('crop.') else {}),
                'lots': [{'quantity': quantity, 'price': str(price)}] if sku.startswith(('crop.', 'product.', 'dish.', 'fertilizer.')) else []})


@guarded
@transaction.atomic
def take_stock(actor_id: str, owner_id: str, sku: str, quantity: int) -> Decimal:
    rows = list(stock_rows(actor_id, owner_id, sku).select_for_update())
    if sku.startswith('crop.'):
        rows.sort(key=lambda row: (row.source.get('stars', 1), row.created_at, row.pk))
    if quantity < 1 or sum(row.quantity for row in rows) < quantity:
        raise ValueError('库存不足')
    remaining, amount = quantity, Decimal(0)
    for row in rows:
        used = min(remaining, row.quantity)
        if not used:
            break
        if row.source.get('lots'):
            needed, kept = used, []
            for lot in row.source['lots']:
                taken = min(needed, lot['quantity'])
                needed -= taken
                amount += Decimal(lot['price']) * taken
                if lot['quantity'] > taken:
                    kept.append({**lot, 'quantity': lot['quantity'] - taken})
            if needed:
                raise ValueError('库存批次不一致')
            row.source = {**row.source, 'lots': kept}
            if kept:
                row.value = Decimal(kept[0]['price'])
        else:
            amount += row.value * used
        remaining -= used
        if row.quantity == used:
            row.delete()
        else:
            row.quantity -= used
            row.save(update_fields=['quantity', 'source', 'value'])
    return amount


def preview_cost(actor_id: str, owner_id: str, sku: str, quantity: int) -> Decimal:
    """Read the same low-star/FIFO selection used by take_stock, without consuming."""
    rows = list(stock_rows(actor_id, owner_id, sku))
    if sku.startswith('crop.'):
        rows.sort(key=lambda row: (row.source.get('stars', 1), row.created_at, row.pk))
    remaining, amount = quantity, Decimal(0)
    for row in rows:
        for lot in row.source.get('lots') or [{'quantity': row.quantity, 'price': str(row.value)}]:
            used = min(remaining, lot['quantity'])
            amount += Decimal(lot['price']) * used
            remaining -= used
    if remaining:
        raise ValueError('库存不足')
    return amount
