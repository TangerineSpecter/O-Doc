"""Feasible finite choices; arbitrary plans remain available through the text helper."""
from decimal import Decimal
from collections import Counter
import hashlib
import json
from .market_model_context import projection
from .market_queries import actor_context, listings
from .market_shop import shop_payload
from .inventory_stock import stock_quantity, inventory_items
from .farm_gate import guarded
from .market_shopping import purchase_detail
from .market_service import tradable


def recovery_values(lots: list[dict], maximum: int, needed: int = 0) -> dict[str, str]:
    """Quote the exact FIFO portions shown in quantity choices without consuming."""
    result = {}
    for count in {1, maximum, needed} - {0}:
        remaining, amount = count, Decimal(0)
        for lot in lots:
            used = min(remaining, lot['quantity'])
            remaining -= used
            amount += Decimal(lot['price']) * used
        if remaining == 0:
            result[str(count)] = str(amount)
    return result


@guarded
def candidates(owner: str, agent) -> list[dict]:
    agent.refresh_from_db()
    context = actor_context(owner, agent)
    shop = shop_payload(owner)
    spending, queue = context['spending'], context['farm_queue'] or {}
    cash = Decimal(spending['spendable'])
    from .farm_models import AgentFarm
    from .farm_queue_plan import current
    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    plan = current(farm) if farm else None
    from django.utils import timezone
    procurement = None
    if plan and plan['status'] in ('pending', 'active', 'completed') and timezone.now().timestamp() < plan['cutoff']:
        procurement = max(Decimal(0), Decimal(plan['procurement_limit']) - sum((Decimal(p['amount']) for p in plan['purchases']), Decimal(0)))
    needs = {}
    for entry in queue.get('entries', []):
        needs[entry['sku']] = needs.get(entry['sku'], 0) + entry.get('missing_seeds', 0)
        if entry.get('fertilizer'):
            sku = 'fertilizer.' + entry['fertilizer']
            needs[sku] = needs.get(sku, 0) + entry.get('missing_fertilizer', 0)
    result = []

    def add(name: str, label: str, arguments: dict, maximum: int, *, unit_price=None, sku='', detail=None, recovery=None):
        maximum = min(1000000, maximum)
        if maximum < 1:
            return
        identity = hashlib.sha256(json.dumps([name, arguments], sort_keys=True).encode()).hexdigest()[:32]
        result.append({'id': 'item:' + identity, 'label': label, 'tool': name, 'arguments': arguments,
                       'maximum': maximum, 'needed': min(maximum, needs.get(sku, 0)),
                       'unit_price': str(unit_price) if unit_price is not None else None,
                       'detail': projection(detail or {}), 'recovery': recovery or {}})

    for row in [*shop['slots'], *shop['supplies'], {'id': 'feed', **shop['feed']}]:
        if row['id'] not in ('feed', *[s['id'] for s in shop['supplies']]) and row['id'] not in spending['purchased_slot_ids'] and spending['slots_remaining'] == 0:
            continue
        unit = Decimal(row['price'])
        available_cash = min(cash, procurement) if procurement is not None and (row['sku'].startswith('seed.') or row['sku'] in needs) else cash
        maximum = min(row.get('remaining_quantity', 1000000), int(available_cash // unit))
        if row.get('kind') == 'bait':
            from .fishing.constants import MAX_BAIT_STOCK
            maximum = min(maximum, max(0, MAX_BAIT_STOCK - stock_quantity(agent.pk, owner, row['sku'])))
        if row.get('kind') == 'animal':
            building = row['rules']['building']
            house = farm.state['buildings'].get(building, {}) if farm else {}
            capacity = house.get('capacity', 0)
            used = sum(1 for animal in farm.state['animals'] if animal['building'] == building) if farm else 0
            maximum = min(maximum, max(0, capacity - used), 1)
        add('buy_market_shop', '购买 ' + row['name'], {'batch_id': shop['id'], 'slot_id': row['id']}, maximum,
            unit_price=unit, sku=row['sku'], detail=purchase_detail(row, context))
    originals = {item.pk: item for item in inventory_items(agent.pk, owner)}
    free_materials, free_by_sku = {}, Counter()
    if any(item.source.get('sku', '').startswith('combat.material.') for item in originals.values()):
        from .crafting_materials import available_pool
        for material in available_pool(owner, agent.pk):
            free_materials[material['inventory_id']] = material['quantity']
            free_by_sku[material['sku']] += material['quantity']
    for row in context['inventory']:
        sku = row['source'].get('sku', '')
        item = originals[row['id']]
        if sku.startswith(('crop.', 'product.', 'dish.')):
            lots = item.source.get('lots') or [{'quantity': item.quantity, 'price': str(item.value)}]
            add('sell_to_market_shop', '回收出售 ' + row['name'], {'item_id': row['id']}, row['quantity'],
                detail=row, recovery=recovery_values(lots, row['quantity']))
        if tradable(item):
            maximum = free_materials.get(row['id'], 0) if sku.startswith('combat.material.') else row['quantity']
            add('create_market_listing', '上架 ' + row['name'], {'item_id': row['id']}, maximum,
                detail={**row, 'pricing': '自主定价；回收价值仅供参考，上架不等于成交'})
    supplies = context['combat_supplies']
    for row in supplies['potions']:
        unit = Decimal(row['purchase_price'])
        add('buy_combat_potion', '购买药剂 ' + row['name'], {'potion_id': row['id']}, min(20, int(cash // unit)), unit_price=unit, detail={**row, 'owned': stock_quantity(agent.pk, owner, 'combat.' + row['id'])})
    for row in supplies['materials']:
        maximum = min(99, free_by_sku['combat.' + row['id']])
        add('sell_combat_material', '出售材料 ' + row['name'], {'material_id': row['id']}, maximum,
            detail=row, recovery=recovery_values([{'quantity': maximum, 'price': row['sale_price']}], maximum) if maximum else {})
    for row in supplies['equipment']:
        add('sell_combat_equipment', '出售闲置装备 ' + row['snapshot']['name'], {'equipment_id': row['id']}, 1, detail=row,
            recovery={'1': str(row['value'])})
    # List every page; choices themselves are paged by the decision loop.
    number = 1
    while True:
        rows = listings(owner, {'page': number})
        from system_settings.models import Agent
        sellers = set(Agent.objects.filter(pk__in=[r['seller_id'] for r in rows['items']], archived_at__isnull=True).values_list('pk', flat=True))
        for row in rows['items']:
            if row['seller_id'] == agent.pk:
                detail = {key: row[key] for key in ('id', 'version', 'unit_price', 'remaining_quantity', 'created_at')}
                detail['item'] = row['item']
                for tool, label in [('reprice_market_listing', '改价 '), ('withdraw_market_listing', '撤回 ')]:
                    add(tool, label + row['item']['name'], {'listing_id': row['id'], 'version': row['version']},
                        row['remaining_quantity'], detail=detail)
                continue
            if row['seller_id'] not in sellers:
                continue
            unit = Decimal(row['unit_price'])
            sku = row['item'].get('source', {}).get('sku', '')
            available_cash = min(cash, procurement) if procurement is not None and (sku.startswith('seed.') or sku in needs) else cash
            add('buy_market_listing', '购买挂牌 ' + row['item']['name'], {'listing_id': row['id'], 'version': row['version']},
                min(row['remaining_quantity'], int(available_cash // unit)), unit_price=unit, sku=sku, detail=row)
        if number * 20 >= rows['total']:
            break
        number += 1
    return result


def quantities(candidate: dict) -> dict[str, object]:
    reserve = min(candidate['maximum'], candidate['detail'].get('next_round_seed_reference', 0))
    values = sorted({1, candidate['maximum'], candidate['needed'], reserve} - {0})
    return {str(value): {'quantity': value, 'total_cost': str(Decimal(candidate['unit_price']) * value)
                        if candidate['unit_price'] else None,
                        'total_revenue': candidate.get('recovery', {}).get(str(value))} for value in values} | {
        'other': '需要其他数量或复杂计划，交给文本模型', 'wait': '等待下次机会并结束本次市场', 'leave': '现在离开市场'}
