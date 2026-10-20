"""日市场规划的代码候选：数量档位、价格上限、装备部位都在这里算好。

模型只做“选一个档位”的小决策，不做算术、不枚举笛卡尔组合。单题状态
控制在一千字符上下，候选最多 MAX_OPTIONS 个；模型不可用时由代码按缺口
默认值收官，不再回退到付费文本模型。
"""
from decimal import Decimal

from .inventory_stock import stock_quantity
from .market_models import MarketListing
from .market_no_buy import filter_candidates
from .market_shop import shop_payload

MAX_OPTIONS = 10
MAX_QUESTIONS = 6
GOAL_SLOTS = ('weapon', 'offhand', 'head', 'body', 'hands', 'legs', 'feet',
              'accessory', 'ring_1', 'ring_2')
SEED_PREFIX = 'seed.'
FERTILIZER_PREFIX = 'fertilizer.'


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal('0.01'))


def quantity_options(missing: int, unit_price, available, *, unit: str = '份',
                     owned: int = 0) -> tuple[dict, dict]:
    """围绕缺口生成 0 / 一半 / 缺口 / 缺口+1 / 缺口+2 档位，去重并过滤买不起的。"""
    missing = max(0, int(missing or 0))
    if missing <= 0:
        return {}, {}
    price = money(unit_price)
    budget = max(Decimal(0), money(available))
    if price <= 0:
        return {}, {}
    half = max(1, (missing + 1) // 2)
    choices, meta = {}, {}
    wanted = sorted({0, half, missing, missing + 1, missing + 2})
    for quantity in [min(99, value) for value in wanted][:MAX_OPTIONS]:
        cost = (price * quantity).quantize(Decimal('0.01'))
        if quantity and cost > budget:
            continue
        choices[str(quantity)] = _quantity_label(quantity, missing, cost, unit, owned)
        meta[str(quantity)] = {'quantity': quantity, 'cost': str(cost)}
    return choices, meta


def _quantity_label(quantity: int, missing: int, cost: Decimal, unit: str, owned: int) -> str:
    if quantity == 0:
        return f'不买，先用现有{owned}{unit}' if owned else '不买'
    if quantity < missing:
        return f'买{quantity}{unit}（约{cost}元），先补一部分'
    if quantity == missing:
        return f'买{quantity}{unit}（约{cost}元），刚好补齐今天'
    return f'买{quantity}{unit}（约{cost}元），多备{quantity - missing}{unit}'


def price_options(min_price, *, unit: str = '件') -> tuple[dict, dict]:
    """按当前最低价生成 不追 / 最低价 / +10% / +20% 四档上限。"""
    base = money(min_price)
    if base <= 0:
        return {}, {}
    values = sorted({base, (base * Decimal('1.1')).quantize(Decimal('0.01')),
                     (base * Decimal('1.2')).quantize(Decimal('0.01'))})
    choices, meta = {'0': '不追，等更合适的'}, {'0': {'price': '0'}}
    for index, value in enumerate(values):
        tag = '当前最低价' if index == 0 else f'加{(value / base - 1) * 100:.0f}%'
        choices[str(value)] = f'≤{value}元/{unit}（{tag}）'
        meta[str(value)] = {'price': str(value)}
    return choices, meta


def _fertilizer_effect(rule: dict) -> str:
    if rule.get('yield_percentage'):
        return f'每袋约 +{rule["yield_percentage"]}% 产量'
    if rule.get('quality_bonus'):
        return f'每袋约 +{round(float(rule["quality_bonus"]) * 100)}% 品质'
    return ''


def need_rows(owner: str, agent, now=None) -> list[dict]:
    """从种植队列和当小时报价计算缺口，只保留今天买得到的种子和肥料。"""
    from .farm_catalog import catalog_for
    from .farm_models import AgentFarm
    from .farm_queue_plan import overview
    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    queue = overview(farm) or {}
    rules = catalog_for(owner).rules
    shop = shop_payload(owner, now)
    slot_prices = {row['sku']: money(row['price']) for row in shop['slots']}
    supply_prices = {row['sku']: money(row['price']) for row in shop['supplies']}
    seeds, fertilizers = {}, {}
    for entry in queue.get('entries', []):
        missing = int(entry.get('missing_seeds') or 0)
        if missing > 0:
            seeds[entry['sku']] = seeds.get(entry['sku'], 0) + missing
        kind = entry.get('fertilizer')
        missing = int(entry.get('missing_fertilizer') or 0)
        if kind and missing > 0:
            sku = FERTILIZER_PREFIX + kind
            fertilizers[sku] = fertilizers.get(sku, 0) + missing
    rows = []
    for sku, missing in sorted(seeds.items(), key=lambda item: (-item[1], item[0])):
        price = slot_prices.get(sku)
        if not price:
            continue  # 本小时没有报价，今天买不到，不生成采购目标
        kind = sku.removeprefix(SEED_PREFIX)
        crop = rules['crops'].get(kind, {})
        rows.append({'key': 'seed:' + sku, 'kind': 'seed', 'sku': sku,
                     'name': crop.get('name', kind) + '种子', 'missing': missing,
                     'owned': stock_quantity(agent.pk, owner, sku),
                     'unit_price': price, 'unit': '份'})
    for sku, missing in sorted(fertilizers.items(), key=lambda item: (-item[1], item[0])):
        kind = sku.removeprefix(FERTILIZER_PREFIX)
        rule = rules['fertilizers'].get(kind, {})
        price = supply_prices.get(sku) or money(rule.get('base_price', 0))
        if not price:
            continue
        rows.append({'key': 'fertilizer:' + sku, 'kind': 'fertilizer', 'sku': sku,
                     'name': rule.get('name', kind), 'missing': missing,
                     'owned': stock_quantity(agent.pk, owner, sku),
                     'unit_price': price, 'unit': '袋',
                     'effect': _fertilizer_effect(rule)})
    return rows


def listing_rows(owner: str, actor_id: str, limit: int = 2) -> list[dict]:
    """按 sku 聚合居民挂牌，优先高星、其次性价比，最多返回 limit 个。"""
    best = {}
    for row in MarketListing.objects.filter(owner_id=owner, status='active').exclude(seller_id=actor_id):
        item = row.item or {}
        source = item.get('source') or {}
        sku = source.get('sku') or ''
        if not sku:
            continue
        entry = best.setdefault(sku, {'sku': sku, 'name': item.get('name', sku), 'count': 0,
                                      'min_price': row.unit_price,
                                      'max_stars': int(source.get('stars') or 1),
                                      'value': money(item.get('value'))})
        entry['count'] += row.remaining_quantity
        entry['min_price'] = min(entry['min_price'], row.unit_price)
        entry['max_stars'] = max(entry['max_stars'], int(source.get('stars') or 1))
        entry['value'] = max(entry['value'], money(item.get('value')))

    def rank(entry):
        value = entry['value']
        ratio = (entry['min_price'] / value) if value > 0 else Decimal('999')
        return (-entry['max_stars'], ratio, entry['sku'])

    return sorted(best.values(), key=rank)[:limit]


def equipment_rows(owner: str, actor_id: str, limit: int = 2) -> list[dict]:
    """空部位且存在可穿戴、有提升的挂牌，按部位汇总候选数量与最低价。"""
    from .combat.models import CombatProfile, EquipmentInstance
    profile = CombatProfile.objects.filter(pk=actor_id, owner_id=owner).first()
    if not profile:
        return []
    loadout = profile.loadout or {}
    empty = [slot for slot in GOAL_SLOTS if not loadout.get(slot)]
    if not empty:
        return []
    job = (profile.progression or {}).get('job', '')
    level = int((profile.progression or {}).get('level', 1))
    rows = list(MarketListing.objects.filter(
        owner_id=owner, status='active', item__source__kind='combat_equipment'
    ).exclude(seller_id=actor_id).order_by('unit_price')[:30])
    gear_ids = [str((row.item or {}).get('source', {}).get('equipment_id') or '') for row in rows]
    gears = {gear.pk: gear for gear in EquipmentInstance.objects.filter(
        pk__in=[identity for identity in gear_ids if identity])}
    by_slot = {}
    for row in rows:
        item = row.item or {}
        equipment_id = str((item.get('source') or {}).get('equipment_id') or '')
        gear = gears.get(equipment_id)
        snapshot = (gear.snapshot if gear else item.get('equipment_snapshot')) or {}
        snapshot_slot = snapshot.get('slot')
        if snapshot_slot == 'accessory':
            targets = ([slot for slot in ('ring_1', 'ring_2') if not loadout.get(slot)]
                       if snapshot.get('equipment_type') == 'ring'
                       else ([] if loadout.get('accessory') else ['accessory']))
        elif snapshot_slot in empty:
            targets = [snapshot_slot]
        else:
            targets = []
        candidate = {'listing_id': row.pk, 'version': row.version, 'equipment_id': equipment_id,
                     'snapshot': snapshot, 'rules': gear.rules if gear else {},
                     'name': item.get('name', '装备'), 'price': str(row.unit_price), 'quantity': 1}
        for slot in targets:
            current_id = loadout.get(slot)
            current = EquipmentInstance.objects.filter(pk=current_id, owner_id=owner).first() if current_id else None
            if not filter_candidates(owner, actor_id, [candidate], job, level, slot=slot,
                                     current=current.snapshot if current else None):
                continue
            entry = by_slot.setdefault(slot, {'slot': slot, 'count': 0, 'min_price': row.unit_price})
            entry['count'] += 1
            entry['min_price'] = min(entry['min_price'], row.unit_price)
    return sorted(by_slot.values(), key=lambda entry: (-entry['count'], entry['min_price']))[:limit]
