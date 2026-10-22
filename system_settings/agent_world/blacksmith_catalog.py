"""Versioned recipes compiled once from the approved material and cost table."""
import copy
from decimal import Decimal, InvalidOperation

from .blacksmith_models import BlacksmithCatalog
from .combat.catalog import bundled

ENERGY_COST = 2
MAX_PIECES = 3
QUALITY_PROBABILITIES = [
    {'quality': 'white', 'probability': .70},
    {'quality': 'blue', 'probability': .25},
    {'quality': 'gold', 'probability': .05},
]
SLOTS = {'weapon': '武器', 'offhand': '副手', 'head': '头部', 'body': '身体',
         'hands': '手部', 'feet': '脚部', 'accessory': '饰品'}
BANDS = [{'id': f'{low}-{high}', 'label': f'Lv.{low}～{high}', 'level_min': low, 'level_max': high}
         for low, high in [(1, 10), *[(low, low + 10) for low in range(10, 90, 10)], (90, 99)]]
BAND_MATERIAL_NAMES = (
    ('叶壳碎片', '绒耳兔毛', '黏液'), ('晶蜥鳞', '蝠翼', '晨光粉尘'),
    ('铁矿', '孢子', '狼牙'), ('骨片', '水灵精华', '狼牙'),
    ('灰烬粉', '水灵精华', '骨片'), ('熔岩碎片', '灰烬粉', '遗迹碎晶'),
    ('熔岩碎片', '熔岩碎片', '火焰核心'), ('裂隙粉尘', '裂隙粉尘', '火焰核心'),
    ('星蚀结晶', '裂隙粉尘', '领主残核'), ('星蚀结晶', '星蚀结晶', '领主残核'),
)
SLOT_RATIOS = ((6, 2, 0), (4, 0, 3), (0, 3, 2), (4, 6, 0), (0, 4, 1), (2, 4, 0), (1, 0, 4))
# Final quantities are published data, not recomputed from future catalog prices.
# Each tuple follows the corresponding slot's first-occurrence SKU order after merging.
DEFAULT_QUANTITIES = {
    '1-10': ((24, 8), (20, 15), (21, 14), (12, 18), (28, 7), (12, 24), (7, 28)),
    '10-20': ((30, 10), (20, 15), (24, 16), (16, 24), (32, 8), (14, 28), (7, 28)),
    '20-30': ((30, 10), (20, 15), (18, 12), (16, 24), (28, 7), (12, 24), (6, 24)),
    '30-40': ((24, 8), (20, 15), (18, 12), (12, 18), (24, 6), (10, 20), (7, 28)),
    '40-50': ((24, 8), (20, 15), (21, 14), (12, 18), (28, 7), (12, 24), (7, 28)),
    '50-60': ((24, 8), (28, 2), (30, 2), (16, 24), (32, 2), (12, 24), (27, 2)),
    '60-70': ((40,), (32, 2), (30, 2), (40,), (32, 2), (36,), (30, 2)),
    '70-80': ((32,), (28, 2), (30, 2), (30,), (28, 2), (30,), (28, 2)),
    '80-90': ((24, 8), (28, 2), (30, 2), (16, 24), (32, 2), (12, 24), (27, 2)),
    '90-99': ((32,), (32, 2), (30, 2), (40,), (32, 2), (36,), (29, 2)),
}
_BUNDLED, _ = bundled()


def material_definitions(catalog=None) -> dict[str, dict]:
    catalog = catalog or _BUNDLED
    result = {}
    for row in catalog.tables['materials']:
        if row['enabled'] != '1':
            continue
        sources = []
        for drop in catalog.tables['drops']:
            if drop['item_kind'] != 'material' or drop['item_id'] != row['id']:
                continue
            monster = catalog.row('monsters', drop['monster_id'])
            dungeon = catalog.monster_dungeons[monster['id']]
            if monster['enabled'] != '1' or dungeon['enabled'] != '1':
                continue
            encounter = next((entry for entry in catalog.tables['dungeon_monsters']
                              if entry['monster_id'] == monster['id'] and entry['enabled'] == '1'), None)
            if monster['rank'] != 'boss' and encounter is None:
                continue
            sources.append({'monster_id': monster['id'], 'monster_name': monster['name'],
                'rank': monster['rank'], 'level_min': int((encounter or monster)['level_min']),
                'level_max': int((encounter or monster)['level_max']), 'dungeon_id': dungeon['id'],
                'dungeon_name': dungeon['name'], 'dungeon_level_min': int(dungeon['recommended_level_min']),
                'dungeon_level_max': int(dungeon['recommended_level_max'])})
        result['combat.' + row['id']] = {'sku': 'combat.' + row['id'], 'name': row['name'],
            'level': int(row['level']), 'sale_price': row['sale_price'], 'sources': sources,
            'source': '、'.join(dict.fromkeys(source['dungeon_name'] for source in sources))}
    return result


MATERIALS = material_definitions()


def material_allowed(material: dict, rule: dict) -> bool:
    return any(source['rank'] != 'boss'
               and max(rule['level_min'], source['level_min']) <= min(rule['level_max'], source['level_max'])
               and max(rule['level_min'], source['dungeon_level_min']) <= min(rule['level_max'], source['dungeon_level_max'])
               for source in material['sources'])


def default_rules() -> dict[str, dict]:
    by_name = {row['name']: row for row in MATERIALS.values()}
    result = {}
    for band, names in zip(BANDS, BAND_MATERIAL_NAMES):
        for index, (slot, label) in enumerate(SLOTS.items()):
            identity = f"{band['id']}:{slot}"
            selected = list(dict.fromkeys(name for name, weight in zip(names, SLOT_RATIOS[index]) if weight))
            ingredients = [{'sku': by_name[name]['sku'], 'name': name, 'price': by_name[name]['sale_price'],
                            'quantity': quantity}
                           for name, quantity in zip(selected, DEFAULT_QUANTITIES[band['id']][index])]
            result[identity] = {'id': identity, 'band_id': band['id'], 'band_label': band['label'],
                'level_min': band['level_min'], 'level_max': band['level_max'], 'slot': slot,
                'slot_name': label, 'version': 1, 'ingredients': ingredients, 'energy_cost': ENERGY_COST}
    return result


DEFAULT_RULES = default_rules()


def rules_for(owner: str) -> dict[str, dict]:
    row = BlacksmithCatalog.objects.filter(pk=owner).first()
    result = copy.deepcopy(DEFAULT_RULES)
    if row:
        result.update(copy.deepcopy(row.rules))
    return result


def catalog_for(owner: str) -> BlacksmithCatalog:
    return BlacksmithCatalog.objects.get_or_create(pk=owner,
        defaults={'version': 1, 'rules': default_rules()})[0]


def validate_ingredients(recipe_id: str, ingredients: object) -> list[dict]:
    rule = DEFAULT_RULES.get(recipe_id)
    if rule is None:
        raise ValueError('打造配方不存在')
    if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= 8:
        raise ValueError('配方须包含 1 至 8 种材料')
    result, seen, elite = [], set(), 0
    for entry in ingredients:
        if not isinstance(entry, dict) or set(entry) - {'sku', 'quantity'}:
            raise ValueError('材料只允许设置 SKU 和数量')
        sku, quantity = entry.get('sku'), entry.get('quantity')
        material = MATERIALS.get(sku) if isinstance(sku, str) else None
        if not material or not material_allowed(material, rule):
            raise ValueError('材料须由与本档相交的迷宫及怪物产出，不能使用首领印记')
        if sku in seen or type(quantity) is not int or not 1 <= quantity <= 9999:
            raise ValueError('材料不得重复，数量须为 1 至 9999 的整数')
        seen.add(sku)
        if all(source['rank'] != 'normal' for source in material['sources']):
            elite += quantity
        result.append({'sku': sku, 'quantity': quantity, 'name': material['name'], 'price': material['sale_price']})
    if elite > 2:
        raise ValueError('每件装备最多消耗 2 个精英材料')
    return result


def validate_rule(value: dict, *, frozen: bool = False) -> dict:
    """Check frozen metadata without replacing historical prices or material names."""
    if not isinstance(value, dict) or not isinstance(value.get('id'), str) or value['id'] not in DEFAULT_RULES:
        raise ValueError('打造配方快照无效')
    base = DEFAULT_RULES[value['id']]
    if any(type(value.get(key)) is not type(base[key]) or value[key] != base[key]
           for key in ('band_id', 'band_label', 'level_min', 'level_max', 'slot', 'slot_name', 'energy_cost')):
        raise ValueError('打造配方固定规则不可修改')
    if type(value.get('version')) is not int or value['version'] < 1:
        raise ValueError('打造配方版本无效')
    ingredients = value.get('ingredients')
    if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= 8:
        raise ValueError('配方须包含 1 至 8 种材料')
    if not all(isinstance(row, dict) for row in ingredients):
        raise ValueError('打造材料快照无效')
    seen = set()
    for row in ingredients:
        sku, quantity = row.get('sku'), row.get('quantity')
        if (not isinstance(sku, str) or not sku.startswith('combat.material.') or sku in seen
                or type(quantity) is not int or not 1 <= quantity <= 9999):
            raise ValueError('打造材料身份或数量无效')
        seen.add(sku)
    # History is self-contained: later monster releases may retire an old material.
    # New candidates and edits still enforce today's real drop sources and elite cap.
    if not frozen:
        validate_ingredients(value['id'], [{'sku': row['sku'], 'quantity': row['quantity']} for row in ingredients])
    for row in ingredients:
        try:
            price = Decimal(str(row['price']))
            if not price.is_finite() or price < 0 or not isinstance(row['name'], str) or not row['name']:
                raise ValueError('打造材料快照无效')
        except (KeyError, InvalidOperation) as exc:
            raise ValueError('打造材料快照无效') from exc
    cost = sum((Decimal(str(row['price'])) * row['quantity'] for row in ingredients), Decimal(0))
    target = Decimal('2.2') * (Decimal(10) + Decimal('.5') * value['level_max'])
    if cost < target:
        raise ValueError(f'配方材料回收价值不得低于 {target:.2f}')
    return copy.deepcopy(value)
