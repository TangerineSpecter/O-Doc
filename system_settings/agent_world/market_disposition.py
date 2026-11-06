"""入库处置策略：入队、聚合、超量拆分与星级选行。

用途目标按 sku 每日复核；新产出套用最近完整新版策略，不给物品标记用途。
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
            source: str = 'stock') -> MarketDispositionTask | None:
    """按居民、上海日期和 SKU 入队；同日入库只累加数量，不重复询问。"""
    if not disposable(sku) or quantity < 0:
        return None
    from .life_time import local_time
    bucket = local_time(timezone.now()).date().isoformat()
    # One local claim per resident/SKU/day, independent of the number of arrivals.
    identity = disposition_task_id(owner, actor_id, sku, 'review', bucket)
    with transaction.atomic():
        task = MarketDispositionTask.objects.select_for_update().filter(pk=identity).first()
        if task:
            from .inventory_policy import is_current
            policy = MarketDisposition.objects.filter(owner_id=owner, actor_id=actor_id, sku=sku).first()
            if task.status == 'done' and (not is_current(policy) or policy.strategy['reviewed_date'] != bucket):
                task.status, task.attempts, task.error = 'pending', 0, ''
                task.save(update_fields=['status', 'attempts', 'error', 'updated_at'])
            if task.status in ('pending', 'running', 'failed'):
                if quantity:
                    task.quantity += quantity
                    task.save(update_fields=['quantity'])
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
    material_skus = [sku for sku in result if sku.startswith('combat.material.')]
    if material_skus:
        from .combat.material_prices import material_catalog, material_price
        catalog = material_catalog(owner, actor_id)
        for sku in material_skus:
            result[sku]['value'] = material_price(catalog, sku)
    return [result[sku] for sku in sorted(result)]


def reserved_quantity(owner: str, actor_id: str, sku: str) -> int:
    """炼金计划及打造当前件已软预留的材料优先保留；探索携带在出发准备时再复核。

    预留计划无法解释时向上抛出，宁可不处置也不能把已排制作的材料卖掉。
    """
    from .inventory_protection import projection
    return projection(owner, actor_id, sku)['required']


def total_quantity(owner: str, actor_id: str, sku: str) -> int:
    return sum(row.quantity for row in rows_for(owner, actor_id, sku))


def surplus_plan(owner: str, actor_id: str, sku: str, *, context=None) -> dict | None:
    """按已生效策略计算本次应出售、上架和保留的数量。"""
    disposition = MarketDisposition.objects.filter(
        owner_id=owner, actor_id=actor_id, sku=sku, status='active').first()
    if not disposition:
        return None
    from .inventory_policy import is_current
    from .inventory_protection import projection
    if not is_current(disposition):
        return None
    state = projection(owner, actor_id, sku, disposition.strategy, context=context)
    surplus = state['disposable']
    sell = surplus * disposition.sell_ratio // 100
    return {**state, 'reserved': state['protected'], 'available': surplus,
            'target_hold': sum(disposition.strategy['targets'].values()), 'surplus': surplus,
            'sell': sell, 'list': surplus - sell, 'keep': state['total'] - surplus,
            'revision': disposition.revision, 'star_order': disposition.star_order,
            'unit_price': listing_price(disposition, sku, owner, actor_id)}


def listing_price(disposition: MarketDisposition, sku: str, owner: str, actor_id: str) -> Decimal:
    rows = rows_for(owner, actor_id, sku)
    value = max((Decimal(str(row.value or 0)) for row in rows), default=Decimal('0'))
    if rows and sku.startswith('combat.material.'):
        from .combat.material_prices import material_catalog, material_price
        value = material_price(material_catalog(owner, actor_id), sku)
    if value <= 0:
        value = Decimal('0.01')
    return max(Decimal('0.01'), (value * disposition.list_price_ratio).quantize(Decimal('0.01')))


def select_rows(owner: str, actor_id: str, sku: str, quantity: int, star_order: str, *,
                skip: int = 0, prevent_expired_relisting: bool = False, context=None):
    """显式按星级选行；现有 split_item 是行内 FIFO，不能替代跨行星级顺序。"""
    rows = rows_for(owner, actor_id, sku)
    expired_returns = set()
    if prevent_expired_relisting:
        from .market_listing_expiry import expired_return_trade_ids
        expired_returns = expired_return_trade_ids(owner, actor_id, rows)
    from .inventory_protection import projection
    from .inventory_policy import is_current
    policy = MarketDisposition.objects.filter(owner_id=owner, actor_id=actor_id, sku=sku).first()
    free = projection(owner, actor_id, sku, policy.strategy if is_current(policy) else None, context=context)['free_rows']
    rows.sort(key=lambda row: ((-1 if star_order == 'high' and not sku.startswith('combat.material.') else 1)
                               * int((row.source or {}).get('stars') or 1), row.created_at, row.pk))
    selected, remaining = [], quantity
    for row in rows:
        if remaining <= 0:
            break
        available = row.quantity if free is None else free.get(row.pk, 0)
        skipped = min(skip, available)
        skip -= skipped
        if str((row.source or {}).get('market_trade_id') or '') in expired_returns:
            continue
        take = min(remaining, available - skipped)
        if take:
            selected.append((row, take))
            remaining -= take
    if remaining and not prevent_expired_relisting:
        raise ValueError('可处置库存不足')
    return selected
