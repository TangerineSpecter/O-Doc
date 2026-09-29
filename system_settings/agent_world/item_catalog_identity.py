"""Shared identity for inventory rows grouped into one catalog entry."""


def inventory_catalog_identity(name, rarity, source):
    source = source or {}
    destination = source.get('destination') or {}
    return ('inventory', source.get('sku') or (
        name, rarity, destination.get('country', ''), destination.get('city', '')))
