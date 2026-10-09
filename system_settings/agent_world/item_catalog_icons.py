"""Stable SKU image links stored with the synchronized farm catalog."""
from collections import Counter
from pathlib import Path

from django.conf import settings
from django.db import transaction
from rest_framework import serializers

from assets.models import Asset
from .farm_catalog import DEFAULT_RULES, catalog_for, normalized_rules
from .farm_models import FarmCatalog
from .farm_gate import farm_gate
from .item_icons import bind_icon, lock_owned_icon, normalize_item_name
from .item_catalog_identity import inventory_catalog_identity
from .travel_models import AgentInventoryItem


@transaction.atomic
def set_catalog_inventory_icon(owner: str, item_id: str, asset_id: str | None) -> int:
    """Bind every current inventory row represented by the selected catalog entry."""
    lock_owned_icon(owner, asset_id)
    rows = list(AgentInventoryItem.objects.select_for_update().filter(owner_id=owner).order_by('id'))
    target = next((row for row in rows if row.pk == item_id), None)
    if not target:
        raise LookupError('图鉴物品不存在')
    if (target.source or {}).get('sku') in catalog_item_names(DEFAULT_RULES):
        raise ValueError('农牧图鉴图片请通过 SKU 设置')
    identity = inventory_catalog_identity(target.name, target.rarity, target.source)
    members = [row for row in rows if inventory_catalog_identity(row.name, row.rarity, row.source) == identity]
    for row in members:
        # Keep per-row saves so the existing inventory synchronization records
        # every changed association; QuerySet.update would bypass those hooks.
        bind_icon(row.pk, owner, asset_id)
    return len(members)


def catalog_item_names(rules: dict) -> dict[str, str]:
    names = {'feed': '饲料'}
    for kind, crop in rules.get('crops', {}).items():
        names[f'seed.{kind}'] = crop['name'] + '种子'
        names[f'crop.{kind}'] = crop['name']
    for kind, animal in rules.get('animals', {}).items():
        for quality in ('normal', 'gold'):
            names[f'product.{kind}.{quality}'] = ('金色' if quality == 'gold' else '') + animal['product']
    return names


def catalog_icon_usage_counts(resource_ids=None) -> dict[str, int]:
    allowed = set(resource_ids) if resource_ids is not None else None
    from .cooking_icons import usage_counts
    usage = usage_counts(resource_ids)
    for catalog in FarmCatalog.objects.only('rules').iterator():
        icons = (catalog.rules or {}).get('item_icons') or {}
        usage.update(asset_id for asset_id in icons.values()
                     if isinstance(asset_id, str) and (allowed is None or asset_id in allowed))
    return dict(usage)


def is_catalog_item_icon_used(resource_id: str) -> bool:
    return catalog_icon_usage_counts([resource_id]).get(resource_id, 0) > 0


def validate_catalog_icon_assets(owner: str, rules: dict) -> None:
    asset_ids = set((rules.get('item_icons') or {}).values())
    if not asset_ids:
        return
    valid_ids = list(Asset.objects.select_for_update().filter(
        pk__in=asset_ids, uploader=owner, is_valid=True, source_type='item_icon', file_type='image'
    ).values_list('pk', flat=True))
    if len(valid_ids) != len(asset_ids):
        raise serializers.ValidationError('物品图标必须属于当前账号且资源有效')


def set_catalog_item_icon(owner: str, sku: str, asset_id: str | None) -> str | None:
    """Bind one catalog SKU to an owned icon; null clears the override."""
    if sku.startswith('dish.'):
        from .cooking_icons import set_icon
        return set_icon(owner, sku, asset_id)
    with farm_gate(), transaction.atomic():
        asset = None
        if asset_id:
            asset = Asset.objects.select_for_update().filter(
                pk=asset_id, uploader=owner, is_valid=True, source_type='item_icon', file_type='image').first()
            if not asset:
                raise ValueError('图标不存在或不属于当前账号')
            if not (Path(settings.MEDIA_ROOT) / asset.file_path).is_file():
                raise ValueError('图标文件尚未下载或已丢失，请恢复资源后重试')
        catalog_for(owner)
        catalog = FarmCatalog.objects.select_for_update().get(pk=owner)
        rules = normalized_rules(catalog.rules)
        item_name = catalog_item_names(rules).get(sku)
        if not item_name:
            raise LookupError('图鉴物品不存在或不支持设置图片')
        icons = dict(rules.get('item_icons') or {})
        if asset:
            icons[sku] = asset.pk
            metadata = dict(asset.metadata or {})
            names = list(metadata.get('confirmed_names', []))
            normalized = normalize_item_name(item_name)
            if normalized not in names:
                metadata['confirmed_names'] = [*names, normalized]
                asset.metadata = metadata
                asset.save(update_fields=['metadata', 'update_time'])
        else:
            icons.pop(sku, None)
        rules['item_icons'] = icons
        catalog.rules = rules
        catalog.save(update_fields=['rules', 'updated_at'])
        return asset.pk if asset else None
