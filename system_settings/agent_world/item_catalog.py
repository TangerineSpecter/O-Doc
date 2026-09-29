"""物品图鉴目录：组合农牧规则、共享背包数量和可复用图片，不另建库存或收集记录。"""
from assets.models import Asset
from .farm_catalog import DEFAULT_RULES, normalized_rules
from .farm_models import FarmCatalog
from .travel_models import AgentInventoryItem
from .travel_views import InventorySerializer, inventory_context
from .item_catalog_identity import inventory_catalog_identity


def item_catalog(owner: str) -> list[dict]:
    catalog = FarmCatalog.objects.filter(pk=owner).first()
    rules = normalized_rules(catalog.rules if catalog else DEFAULT_RULES)
    icon_ids = rules.get('item_icons') or {}
    icon_assets = {asset.pk for asset in Asset.objects.filter(
        pk__in=icon_ids.values(), uploader=owner, is_valid=True,
        source_type='item_icon', file_type='image').only('pk')}
    entries = {}

    def add(sku, name, category, description, purchase=None, sale=None, quality='normal'):
        asset_id = icon_ids.get(sku)
        ref_value = purchase if purchase is not None else sale
        entries[sku] = dict(id=sku, sku=sku, name=name, category=category, description=description,
                            purchase_price=purchase, sale_price=sale, quality=quality, quantity=0,
                            reference_value=ref_value,
                            icon_asset_id=asset_id if asset_id in icon_assets else None,
                            icon_url=f'/api/resource/view/{asset_id}' if asset_id in icon_assets else '')

    add('feed', '饲料', 'feed', '每份为一只动物补足最多 24 小时的喂养覆盖，缺饲料时暂停生产。', rules['feed_price'])
    for kind, crop in rules['crops'].items():
        hours = crop['growth_seconds'] / 3600
        add(f'seed.{kind}', crop['name'] + '种子', 'seed',
            f"每块地播种一份；有效生长 {hours:g} 小时，收获 {crop['yield']} 个{crop['name']}。缺水暂停生长。", crop['seed_price'])
        add(f'crop.{kind}', crop['name'], 'crop', '成熟后由居民收获，可出售给世界商店。', sale=crop['sale_price'])
    for kind, animal in rules['animals'].items():
        for quality in ('normal', 'gold'):
            gold = quality == 'gold'
            add(f'product.{kind}.{quality}', ('金色' if gold else '') + animal['product'], 'animal_product',
                '满五颗心时，每轮有 10% 概率产出一个金色品。' if gold else
                f"{animal['name']}的一轮有效生产时间为 {animal['period_seconds'] / 3600:g} 小时；缺饲料暂停生产。",
                sale=animal['sale_price'] * (3 if gold else 1), quality=quality)

    rows = list(AgentInventoryItem.objects.filter(owner_id=owner).order_by('created_at', 'id'))
    serialized = InventorySerializer(rows, many=True, context=inventory_context(rows, owner)).data
    for row in serialized:
        source = row['source'] or {}
        sku = source.get('sku', '')
        if sku in entries:
            entries[sku]['quantity'] += row['quantity']
            continue
        # 无稳定 SKU 的旅行纪念品按名称、品质及目的地归类，避免把不同旅行物品合并。
        destination = source.get('destination') or {}
        identity = inventory_catalog_identity(row['name'], row['rarity'], source)
        if identity not in entries:
            raw_val = row.get('value')
            unit_val = source.get('unitPrice')
            ref_value = raw_val if raw_val is not None else unit_val
            entries[identity] = dict(id='inventory:' + row['id'], sku=sku, name=row['name'],
                category='souvenir' if row['kind'] == 'souvenir' else 'other',
                description=source.get('description') or ('来自' + destination['city'] if destination.get('city') else '居民共用背包中的物品。'),
                purchase_price=unit_val if unit_val is not None else None,
                sale_price=None, quality=row['rarity'], quantity=0,
                reference_value=ref_value,
                icon_asset_id=row.get('icon_asset_id'), icon_url=row['icon_url'])
        entries[identity]['quantity'] += row['quantity']
    return list(entries.values())
