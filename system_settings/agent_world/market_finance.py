"""Classify market proceeds by the business that produced the item."""
from decimal import Decimal

from .farm_catalog import DEFAULT_RULES, normalized_rules
from .farm_models import FarmCatalog
from .market_models import MarketListing, MarketTransaction


FARM_PRODUCT_PREFIXES = ('crop.', 'product.')


def finance_kind_for_sku(sku: str) -> str:
    return 'farm' if isinstance(sku, str) and sku.startswith(FARM_PRODUCT_PREFIXES) else 'market'


def farm_product_names(owner: str | None = None) -> set[str]:
    rulesets = []
    if owner:
        value = FarmCatalog.objects.filter(pk=owner).values_list('rules', flat=True).first()
        rulesets.append(normalized_rules(value) if isinstance(value, dict) else DEFAULT_RULES)
    else:
        rulesets.append(DEFAULT_RULES)
        rulesets.extend(
            normalized_rules(value)
            for value in FarmCatalog.objects.values_list('rules', flat=True)
            if isinstance(value, dict)
        )

    names = set()
    for rules in rulesets:
        names.update(row['name'] for row in rules.get('crops', {}).values() if row.get('name'))
        for row in rules.get('animals', {}).values():
            product = row.get('product')
            if product:
                names.update((product, '金色' + product))
    return names


def transaction_finance_kind(transaction: MarketTransaction, actor_id: str, amount,
                             *, listing: MarketListing | None = None,
                             product_names: set[str] | None = None) -> str:
    """Return the ledger category for one participant's transaction delta."""
    if Decimal(str(amount)) <= 0:
        return 'market'
    operation = transaction.operation if isinstance(transaction.operation, dict) else {}
    result = transaction.result if isinstance(transaction.result, dict) else {}
    kind = operation.get('kind')

    if kind == 'sell' and actor_id == transaction.actor_id:
        name = result.get('name')
        if name and name in (product_names or set()):
            return 'farm'
    elif kind == 'buy_listing' and actor_id != transaction.actor_id:
        sku = ((listing.item.get('source') or {}).get('sku', '')
               if listing and isinstance(listing.item, dict) else '')
        if finance_kind_for_sku(sku) == 'farm':
            return 'farm'
        name = result.get('name')
        if name and name in (product_names or set()):
            return 'farm'
    return 'market'


def classify_market_ledger_entries(entries, owner: str | None = None):
    """Apply the source-based category to legacy market proceeds in memory."""
    transaction_ids = {entry.snapshot.get('market_transaction_id') for entry in entries
                       if entry.kind == 'market' and isinstance(entry.snapshot, dict)} - {None, ''}
    if not transaction_ids:
        return entries

    transactions = MarketTransaction.objects.filter(pk__in=transaction_ids)
    if owner is not None:
        transactions = transactions.filter(owner_id=owner)
    by_id = {row.pk: row for row in transactions}
    listing_ids = {
        row.operation.get('listing_id')
        for row in by_id.values()
        if isinstance(row.operation, dict) and row.operation.get('kind') == 'buy_listing'
    }
    listings = {row.pk: row for row in MarketListing.objects.filter(pk__in=listing_ids)}
    names_by_owner = {}

    for entry in entries:
        snapshot = entry.snapshot if isinstance(entry.snapshot, dict) else {}
        transaction = by_id.get(snapshot.get('market_transaction_id'))
        if not transaction:
            continue
        if transaction.owner_id not in names_by_owner:
            names_by_owner[transaction.owner_id] = farm_product_names(transaction.owner_id)
        product_names = names_by_owner[transaction.owner_id]
        operation = transaction.operation if isinstance(transaction.operation, dict) else {}
        listing = listings.get(operation.get('listing_id'))
        entry.kind = transaction_finance_kind(transaction, entry.agent_id, entry.amount,
                                              listing=listing, product_names=product_names)
    return entries
