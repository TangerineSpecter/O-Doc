"""只读物品图鉴：内置农牧目录与当前共用背包物品，不另建库存或收集记录。"""
from .farm_catalog import DEFAULT_RULES
from .farm_models import FarmCatalog
from .travel_models import AgentInventoryItem
from .travel_views import InventorySerializer, inventory_context


def item_catalog(owner: str) -> list[dict]:
    catalog = FarmCatalog.objects.filter(pk=owner).first()
    rules = catalog.rules if catalog else DEFAULT_RULES
    entries = {}

    def add(sku, name, category, description, purchase=None, sale=None, quality='normal'):
        entries[sku] = dict(id=sku, sku=sku, name=name, category=category, description=description,
                            purchase_price=purchase, sale_price=sale, quality=quality, quantity=0, icon_url='')

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
        identity = ('inventory', sku or (row['name'], row['rarity'], destination.get('country', ''), destination.get('city', '')))
        if identity not in entries:
            entries[identity] = dict(id='inventory:' + row['id'], sku=sku, name=row['name'],
                category='souvenir' if row['kind'] == 'souvenir' else 'other',
                description=source.get('description') or ('来自' + destination['city'] if destination.get('city') else '居民共用背包中的物品。'),
                purchase_price=None, sale_price=None, quality=row['rarity'], quantity=0, icon_url=row['icon_url'])
        entries[identity]['quantity'] += row['quantity']
    return list(entries.values())
