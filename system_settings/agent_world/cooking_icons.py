"""美食按稳定 SKU 绑定图片，未制作和售空时仍可维护。"""
from collections import Counter
from django.db import transaction
from .farm_gate import guarded
from .item_icons import lock_owned_icon, normalize_item_name
from .cooking_catalog import DEFAULT_RULES, catalog_for
from .cooking_models import CookingCatalog


@guarded
@transaction.atomic
def set_icon(owner: str, sku: str, asset_id: str | None):
    if sku.removeprefix('dish.') not in DEFAULT_RULES:
        raise LookupError('食谱不存在')
    asset = lock_owned_icon(owner, asset_id)
    catalog_for(owner)
    catalog = CookingCatalog.objects.select_for_update().get(pk=owner)
    icons = dict(catalog.item_icons)
    if asset:
        icons[sku] = asset.pk
        metadata = dict(asset.metadata or {})
        name = normalize_item_name(DEFAULT_RULES[sku[5:]]['name'])
        metadata['confirmed_names'] = list(dict.fromkeys([*metadata.get('confirmed_names', []), name]))
        asset.metadata = metadata
        asset.save(update_fields=['metadata', 'update_time'])
    else:
        icons.pop(sku, None)
    catalog.item_icons = icons
    catalog.save(update_fields=['item_icons', 'updated_at'])
    return asset_id


def usage_counts(resource_ids=None):
    allowed = set(resource_ids) if resource_ids is not None else None
    counts = Counter()
    for catalog in CookingCatalog.objects.only('item_icons').iterator():
        counts.update(asset for asset in catalog.item_icons.values() if allowed is None or asset in allowed)
    return counts
