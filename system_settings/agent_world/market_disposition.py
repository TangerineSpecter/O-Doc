"""入库处置策略：入队、聚合、超量拆分与星级选行。

处置策略按 sku 长期有效；新产出只入队一次，由 worker 补齐策略后自动套用。
这里不调用模型，也不直接交易，便于在事务内安全入队。
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .inventory_stock import inventory_items
from .market_plan_models import (MarketDisposition, MarketDispositionTask,
                                 disposition_task_id)

DISPOSABLE_PREFIXES = ('crop.', 'product.', 'dish.', 'elixir.', 'combat.material.')
SOUVENIR_PREFIX = 'souvenir.'
SHOP_SELL_PREFIXES = ('crop.', 'product.', 'dish.')
COMBAT_SELL_PREFIXES = ('combat.material.',)
LIST_PREFIXES = ('crop.', 'product.', 'dish.', 'elixir.', 'combat.material.', 'souvenir.')


def disposable(sku: str) -> bool:
    """鱼不进处置队列：进入市场时由 market_fish 统一回收普通鱼。"""
    return bool(sku) and (sku.startswith(DISPOSABLE_PREFIXES) or sku.startswith(SOUVENIR_PREFIX))


def can_shop_sell(sku: str) -> bool:
    return sku.startswith(SHOP_SELL_PREFIXES) or sku.startswith(COMBAT_SELL_PREFIXES)


def can_list(sku: str) -> bool:
    return sku.startswith(LIST_PREFIXES)


def enqueue(owner: str, actor_id: str, sku: str, quantity: int = 1, *,
            source: str = 'stock', operation: str = '') -> MarketDispositionTask | None:
    """按稳定操作键入队；重复入库只累加待标记数量，不重复询问。"""
    if not disposable(sku) or quantity < 0:
        return None
    bucket = operation or timezone.now().strftime('%Y%m%d%H')
    identity = disposition_task_id(owner, actor_id, sku, source, bucket)
    with transaction.atomic():
        task = MarketDispositionTask.objects.select_for_update().filter(pk=identity).first()
        if task:
            if task.status in ('pending', 'running', 'failed'):
                task.quantity += quantity
                task.status = 'pending'
                task.attempts = 0
                task.error = ''
                task.save(update_fields=['quantity', 'status', 'attempts', 'error', 'updated_at'])
            return task
        return MarketDispositionTask.objects.create(
            pk=identity, owner_id=owner, actor_id=actor_id, sku=sku,
            quantity=quantity, source=source[:24],
        )


def rows_for(owner: str, actor_id: str, sku: str):
    return [row for row in inventory_items(actor_id, owner)
            if (row.source or {}).get('sku') == sku]


def aggregate(owner: str, actor_id: str) -> list[dict]:
    """按 sku 聚合库存；星级分布单独保留，避免逐行塞进模型输入。"""
    result = {}
    for row in inventory_items(actor_id, owner):
        source = row.source or {}
        sku = source.get('sku', '')
        if not disposable(sku):
            continue
        entry = result.setdefault(sku, {'sku': sku, 'name': row.name, 'quantity': 0,
                                        'value': Decimal('0'), 'stars': {}})
        entry['quantity'] += row.quantity
        stars = int(source.get('stars') or 1)
        entry['stars'][stars] = entry['stars'].get(stars, 0) + row.quantity
        entry['value'] = max(entry['value'], Decimal(str(row.value or 0)))
    return [result[sku] for sku in sorted(result)]


def reserved_quantity(owner: str, actor_id: str, sku: str) -> int:
    """炼金计划及打造当前件已软预留的材料优先保留；探索携带在出发准备时再复核。

    预留计划无法解释时向上抛出，宁可不处置也不能把已排制作的材料卖掉。
    """
    from .alchemy_materials import material_pool
    from .crafting_materials import available_pool
    total = sum(row['quantity'] for row in material_pool(actor_id, owner) if row['sku'] == sku)
    free = sum(row['quantity'] for row in available_pool(owner, actor_id) if row['sku'] == sku)
    from .blacksmith_goals import requirements
    return max(0, total - free) + requirements(owner, actor_id)[sku]


def total_quantity(owner: str, actor_id: str, sku: str) -> int:
    return sum(row.quantity for row in rows_for(owner, actor_id, sku))


def surplus_plan(owner: str, actor_id: str, sku: str) -> dict | None:
    """按已生效策略计算本次应出售、上架和保留的数量。"""
    disposition = MarketDisposition.objects.filter(
        owner_id=owner, actor_id=actor_id, sku=sku, status='active').first()
    if not disposition:
        return None
    total = total_quantity(owner, actor_id, sku)
    reserved = min(total, reserved_quantity(owner, actor_id, sku))
    available = max(0, total - reserved)
    surplus = max(0, available - disposition.target_hold)
    sell = surplus * disposition.sell_ratio // 100
    listed = surplus * disposition.list_ratio // 100
    return {'total': total, 'reserved': reserved, 'available': available,
            'target_hold': disposition.target_hold, 'surplus': surplus,
            'sell': sell, 'list': listed, 'keep': available - sell - listed,
            'star_order': disposition.star_order,
            'unit_price': listing_price(disposition, sku, owner, actor_id)}


def listing_price(disposition: MarketDisposition, sku: str, owner: str, actor_id: str) -> Decimal:
    rows = rows_for(owner, actor_id, sku)
    value = max((Decimal(str(row.value or 0)) for row in rows), default=Decimal('0'))
    if value <= 0:
        value = Decimal('0.01')
    return max(Decimal('0.01'), (value * disposition.list_price_ratio).quantize(Decimal('0.01')))


def select_rows(owner: str, actor_id: str, sku: str, quantity: int, star_order: str, *, skip: int = 0):
    """显式按星级选行；现有 split_item 是行内 FIFO，不能替代跨行星级顺序。"""
    rows = rows_for(owner, actor_id, sku)
    free = None
    if sku.startswith('combat.material.'):
        from .crafting_materials import available_pool
        free = {row['inventory_id']: row['quantity'] for row in available_pool(owner, actor_id, protect_goals=True)}
    # Combat materials have no stars; match the NPC sale's available-lot FIFO so
    # a combined sale/list plan skips exactly the batches that the sale will take.
    rows.sort(key=lambda row: (int((row.source or {}).get('stars') or 1),
                               row.created_at, row.pk), reverse=free is None and star_order == 'high')
    selected, remaining = [], quantity
    for row in rows:
        if remaining <= 0:
            break
        available = row.quantity if free is None else free.get(row.pk, 0)
        skipped = min(skip, available)
        skip -= skipped
        take = min(remaining, available - skipped)
        if take:
            selected.append((row, take))
            remaining -= take
    if remaining:
        raise ValueError('可处置库存不足')
    return selected
