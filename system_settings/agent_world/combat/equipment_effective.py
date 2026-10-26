"""Read-time recalibration for existing gear; stored snapshots stay immutable."""
from . import equipment
from .store import current


def _resolve(version: str, cache: dict, fallback=None):
    if version in cache:
        return cache[version] or fallback
    try:
        catalog = current(version) if version else fallback
    except (KeyError, ValueError):
        catalog = fallback
    cache[version] = catalog
    return catalog


def for_snapshot(snapshot, catalog):
    return equipment.effective_snapshot(snapshot, catalog) if catalog else snapshot


def for_result(result: dict, cache: dict | None = None) -> dict:
    """Recalculate an equipment result projection with a caller-scoped catalog cache."""
    if not isinstance(result, dict) or not isinstance(result.get('item'), dict) or not result.get('catalog_id'):
        return result
    cache = {} if cache is None else cache
    catalog = _resolve(result['catalog_id'], cache)
    if not catalog:
        return result
    return {**result, 'item': for_snapshot(result['item'], catalog)}


def for_instance(item, catalog=None, cache: dict | None = None):
    cache = {} if cache is None else cache
    return for_snapshot(item.snapshot, _resolve(item.catalog_id, cache, catalog))


def snapshots(items, catalog=None) -> dict:
    """Return effective snapshots keyed by equipment id for a batch of instances."""
    cache = {catalog.version: catalog} if catalog is not None else {}
    return {item.pk: for_instance(item, catalog, cache) for item in items}


def annotate_rows(rows: list[dict], catalog=None) -> list[dict]:
    """Replace ``snapshot`` in queryset dict rows without touching the stored row."""
    cache = {catalog.version: catalog} if catalog is not None else {}
    for row in rows:
        row['snapshot'] = for_snapshot(row.get('snapshot'), _resolve(row.get('catalog_id') or '', cache, catalog))
    return rows
