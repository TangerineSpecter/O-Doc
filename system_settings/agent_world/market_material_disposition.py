"""Allocate protected battle-material surplus to exact recovery and listing batches."""
from django.db.models import Sum

from .market_expiry_index import visible_listings
from .market_listing_expiry import expired_return_trade_ids
from .market_models import MarketListing

MATERIAL_PREFIX = 'combat.material.'
LISTING_LIMIT = 5
TRADE_LIMIT = 1_000_000


def listing_room(owner: str, actor_id: str, now, *, sku: str | None = None) -> dict[str, int]:
    listings = MarketListing.objects.filter(owner_id=owner, seller_id=actor_id, status='active',
                                            remaining_quantity__gt=0)
    listings = (listings.filter(item__source__sku=sku) if sku else
                listings.filter(item__source__sku__startswith=MATERIAL_PREFIX))
    listings = visible_listings(owner, listings, now)
    return {row['item__source__sku']: max(0, LISTING_LIMIT - row['remaining'])
            for row in listings.order_by().values('item__source__sku').annotate(remaining=Sum('remaining_quantity'))}


def _take(rows: list[tuple[str, int]], quantity: int) -> dict[str, int]:
    result = {}
    for identity, available in rows:
        if not quantity:
            break
        taken = min(available, quantity)
        result[identity] = taken
        quantity -= taken
    return result


def allocate(rows, free_rows: dict[str, int], expired_ids: set[str], sell_ratio: int,
             room: int | None, *, sale_limit: int = TRADE_LIMIT) -> tuple[dict[str, int], dict[str, int], int]:
    """Rows arrive in FIFO order. Without a listing plan, defer the ordinary mixed allocation."""
    returned, fresh = [], []
    for row in rows:
        free = free_rows.get(row.pk, 0)
        if free:
            trade_id = str((row.source or {}).get('market_trade_id') or '')
            target = returned if trade_id in expired_ids else fresh
            target.append((row.pk, free))
    expired = sum(quantity for _, quantity in returned)
    fresh_total = sum(quantity for _, quantity in fresh)
    if room is None:
        listing = 0
        fresh_sell = fresh_total if sell_ratio == 100 else 0
    else:
        policy_sell = fresh_total * sell_ratio // 100
        listing = min(room, fresh_total - policy_sell)
        fresh_sell = fresh_total - listing
    sale = _take([*returned, *fresh], min(sale_limit, expired + fresh_sell))
    # Preserve the portion assigned to recovery, including any amount above the per-trade cap.
    list_stock = _take(list(reversed(fresh)), listing)
    return sale, dict(reversed(list(list_stock.items()))), expired


def plan(owner: str, actor_id: str, rows, state: dict,
         room: int | None, *, sale_limit: int = TRADE_LIMIT) -> tuple[dict[str, int], dict[str, int], int]:
    return allocate(rows, state['free_rows'], expired_return_trade_ids(owner, actor_id, rows),
                    state['sell_ratio'], room, sale_limit=sale_limit)
