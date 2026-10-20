"""Pure, bounded queue proposals. Estimates grant no resources or future purchases."""
import copy
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, ROUND_DOWN

from .farm_queue_estimate import estimate, planting_time, plot_availability

MAX_BASKETS = 10
# Full subset enumeration stays cheap at this size. Above it, use a linear sample.
SUBSET_ENUM_LIMIT = 8
# 手头没有种子时只比较收益最高的几种作物，避免购物清单过长。
PURCHASE_CROPS = 3


@dataclass
class FarmQueueFacts:
    state: dict
    rules: dict
    seed: str
    crops: list[dict]
    fertilizers: dict
    seed_prices: dict[str, Decimal]
    spendable: Decimal
    start: datetime
    cutoff: datetime
    seed_price_sources: dict[str, str] = field(default_factory=dict)


def allocate(facts: FarmQueueFacts, crops: list[dict], quantity: str, balanced=False,
             replenish=False) -> list[dict]:
    """Choose bounded targets using the same half-hour grid as the queue estimate."""
    start, cutoff = facts.start.timestamp(), facts.cutoff.timestamp()
    available = plot_availability(facts.state, facts.seed, start)
    stocks = {c['seed_sku']: 1000 if replenish else min(1000, c['seed_quantity']) for c in crops}
    counts = Counter()
    cursor = 0
    maximum = len(available) if quantity == 'round' else sum(stocks.values())
    for _ in range(maximum):
        eligible = [c for c in crops if stocks[c['seed_sku']] > 0]
        if not eligible or not available:
            break
        if balanced:
            crop = next((crops[(cursor + i) % len(crops)] for i in range(len(crops))
                         if stocks[crops[(cursor + i) % len(crops)]['seed_sku']] > 0))
            cursor = (crops.index(crop) + 1) % len(crops)
        else:
            crop = eligible[0]
        index = min(range(len(available)), key=available.__getitem__)
        at = planting_time(available[index], start)
        if at >= cutoff:
            break
        counts[crop['seed_sku']] += 1
        stocks[crop['seed_sku']] -= 1
        available[index] = at + crop['growth_seconds']
    entries = [{'sku': c['seed_sku'], 'quantity': counts[c['seed_sku']]}
               for c in crops if counts[c['seed_sku']]]
    # Grouping a balanced sequence by SKU changes its order: validate the final
    # stored order rather than promising the capacity of the temporary sequence.
    rows = [{**e, 'id': str(i)} for i, e in enumerate(entries)]
    capacity = estimate(facts.state, rows, facts.rules, facts.seed, start, cutoff)['entries']
    return [{**entry, 'quantity': result['sowable']} for entry, result in zip(entries, capacity)
            if result['sowable']]


def preview(facts: FarmQueueFacts, entries: list[dict]) -> dict:
    stocks = {k: row.get('quantity', 0) for k, row in facts.fertilizers.items()}
    ready, missing = [], Counter()
    for index, entry in enumerate(entries):
        count, kind = entry['quantity'], entry['fertilizer']
        if kind:
            used = min(count, stocks.get(kind, 0))
            missing[kind] += count - used
            stocks[kind] -= used
            if entry['fertilizer_mode'] == 'required':
                count = used
        ready.append({**entry, 'id': str(index), 'quantity': count})
    capacity = estimate(facts.state, ready, facts.rules, facts.seed,
                        facts.start.timestamp(), facts.cutoff.timestamp())['entries']
    crops = {c['seed_sku']: c for c in facts.crops}
    fert_left = {k: row.get('quantity', 0) for k, row in facts.fertilizers.items()}
    lots = {k: copy.deepcopy(row.get('cost_lots', [
        {'quantity': row.get('quantity', 0), 'price': row.get('next_inventory_cost') or '0'}]))
        for k, row in facts.fertilizers.items()}
    revenue = net_gain = 0.0
    for entry, actual in zip(ready, capacity):
        crop, count = crops[entry['sku']], actual['sowable']
        base = crop['without_fertilizer']['expected_revenue']
        revenue += base * count
        kind = entry['fertilizer']
        if kind:
            used = min(count, fert_left.get(kind, 0))
            fert_left[kind] -= used
            delta = crop['fertilizers'][kind]['expected_revenue'] - base
            remaining, cost = used, 0.0
            for lot in lots[kind]:
                taken = min(remaining, lot['quantity'])
                cost += float(lot['price']) * taken
                lot['quantity'] -= taken
                remaining -= taken
            revenue += delta * used
            net_gain += delta * used - cost
    return {'sowable': sum(c['sowable'] for c in capacity),
            'harvestable_today': sum(c['harvestable'] for c in capacity),
            'eventual_expected_revenue': round(revenue, 4),
            'fertilizer_inventory_net_gain': round(net_gain, 4),
            'missing_fertilizer': dict(missing),
            'required_fertilizer_wait': any(e['fertilizer_mode'] == 'required'
                                          and missing.get(e['fertilizer'], 0) for e in entries)}


def return_order(facts: FarmQueueFacts, crops: list[dict]) -> list[dict]:
    return sorted(crops, key=lambda crop: (
        -(crop['without_fertilizer']['expected_revenue'] - float(facts.seed_prices[crop['seed_sku']]))
        / crop['growth_seconds'], crop['seed_sku']))


def _plain(entries: list[dict]) -> list[dict]:
    return [{'sku': entry['sku'], 'quantity': entry['quantity'],
             'fertilizer_mode': 'none', 'fertilizer': None} for entry in entries]


def _families(facts: FarmQueueFacts, owned: list[dict]) -> list[list[dict]]:
    ranked = return_order(facts, owned)
    count = len(ranked)
    if count <= SUBSET_ENUM_LIMIT:
        return [[ranked[index] for index in range(count) if mask >> index & 1]
                for mask in range(1, 1 << count)]
    groups = [ranked, *([crop] for crop in ranked)]
    groups += [[crop for crop in ranked if crop is not skipped] for skipped in ranked]
    groups += [ranked[:size] for size in range(1, count)]
    return groups


def ranked_baskets(facts: FarmQueueFacts) -> list[dict]:
    """Distinct owned-seed baskets, highest unfertilized revenue first, at most 10."""
    if facts.start >= facts.cutoff:
        return []
    owned = [crop for crop in facts.crops if crop['seed_quantity'] > 0]
    if not owned:
        return []
    found = {}
    for group in _families(facts, owned):
        raw = allocate(facts, return_order(facts, group), 'day')
        if not raw:
            continue
        entries = _plain(raw)
        key = tuple(sorted((entry['sku'], entry['quantity']) for entry in entries))
        if key in found:
            continue
        found[key] = {'entries': entries, 'summary': preview(facts, entries)}
    rows = sorted(found.values(), key=lambda row: (
        -row['summary']['eventual_expected_revenue'], -row['summary']['sowable'],
        tuple(sorted((entry['sku'], entry['quantity']) for entry in row['entries']))))
    return rows[:MAX_BASKETS]


def budgeted(facts: FarmQueueFacts, targets: list[dict]) -> list[dict]:
    """只保留可支配余额买得起的数量，按目标顺序截断。"""
    budget, kept = facts.spendable, []
    for entry in targets:
        price = facts.seed_prices.get(entry['sku'], Decimal(0))
        if price <= 0:
            continue
        count = min(int(entry['quantity']), int(budget // price))
        if count <= 0:
            break
        budget -= price * count
        kept.append({**entry, 'quantity': count})
    return kept


def purchase_baskets(facts: FarmQueueFacts) -> list[dict]:
    """手头没有种子时，按收益给出可采购的真实作物组合。

    数量仍由代码算好，成交与否则由每日市场按队列缺口执行；没有可支配余额
    或没有空余地块时间时返回空列表，让队列保持空队列而不是许诺买不起的种子。
    """
    if facts.spendable <= 0 or facts.start >= facts.cutoff:
        return []
    pool = [crop for crop in return_order(facts, facts.crops)
            if facts.seed_prices.get(crop['seed_sku'], Decimal(0)) > 0][:PURCHASE_CROPS]
    if not pool:
        return []
    found = {}
    for group in _families(facts, pool):
        targets = allocate(facts, return_order(facts, group), 'day',
                           balanced=len(group) > 1, replenish=True)
        targets = budgeted(facts, targets)
        if not targets:
            continue
        entries = _plain(targets)
        key = tuple(sorted((entry['sku'], entry['quantity']) for entry in entries))
        if key in found:
            continue
        found[key] = {'entries': entries, 'summary': preview(facts, entries), 'purchase': True}
    rows = sorted(found.values(), key=lambda row: (
        -row['summary']['eventual_expected_revenue'], -row['summary']['sowable'],
        tuple(sorted((entry['sku'], entry['quantity']) for entry in row['entries']))))
    return rows[:MAX_BASKETS]


def crop_name(facts: FarmQueueFacts, sku: str) -> str:
    for crop in facts.crops:
        if crop.get('seed_sku') == sku and crop.get('name'):
            return crop['name']
    return facts.rules['crops'].get(sku.removeprefix('seed.'), {}).get('name') or sku.removeprefix('seed.')


def describe_basket(facts: FarmQueueFacts, row: dict) -> str:
    summary = row['summary']
    crops = '、'.join(f"{crop_name(facts, entry['sku'])}×{entry['quantity']}" for entry in row['entries'])
    text = f"{crops}，可播{summary['sowable']}，估算{summary['eventual_expected_revenue']}"
    if summary['harvestable_today'] != summary['sowable']:
        text += f"，今日可收{summary['harvestable_today']}"
    if row.get('purchase'):
        cost = purchase_cost(facts, row['entries'], 'none', None)
        text += f"，需先买种子约{_yuan(str(cost))}元"
    return text


def _yuan(amount: str) -> str:
    text = f'{Decimal(amount):.2f}'
    return text.rstrip('0').rstrip('.')


def capped(facts: FarmQueueFacts, cost: Decimal) -> str:
    amount = max(Decimal(0), min(cost, facts.spendable)).quantize(Decimal('0.01'), rounding=ROUND_DOWN)
    return f'{amount:.2f}'


def _owned(facts: FarmQueueFacts) -> dict[str, int]:
    return {crop['seed_sku']: crop['seed_quantity'] for crop in facts.crops}


def _unit_price(facts: FarmQueueFacts, kind: str) -> Decimal:
    stock = facts.fertilizers.get(kind) or {}
    quote = (stock.get('quote') or {}).get('price')
    if quote in (None, ''):
        quote = facts.rules['fertilizers'][kind]['base_price']
    return Decimal(str(quote))


def purchase_cost(facts: FarmQueueFacts, targets: list[dict], mode: str, kind: str | None) -> Decimal:
    owned = _owned(facts)
    cost, total = Decimal(0), 0
    for entry in targets:
        total += entry['quantity']
        cost += Decimal(max(0, entry['quantity'] - owned.get(entry['sku'], 0))) * facts.seed_prices.get(
            entry['sku'], Decimal(0))
    if mode == 'required' and kind and total:
        stock = facts.fertilizers.get(kind) or {}
        cost += Decimal(max(0, total - int(stock.get('quantity') or 0))) * _unit_price(facts, kind)
    return cost


def _gain(facts: FarmQueueFacts, entries: list[dict], kind: str, inventory: bool) -> float:
    crops = {crop['seed_sku']: crop for crop in facts.crops}
    total = 0.0
    for entry in entries:
        option = ((crops.get(entry['sku']) or {}).get('fertilizers') or {}).get(kind) or {}
        if inventory:
            value = option.get('inventory_additional_net_revenue', option.get('additional_net_revenue', 0))
        else:
            value = option.get('additional_net_revenue', 0)
        total += float(value or 0) * entry['quantity']
    return total


def _best_kind(facts: FarmQueueFacts, entries: list[dict], kinds: list[str], inventory: bool) -> str:
    return min(kinds, key=lambda kind: (-_gain(facts, entries, kind, inventory), kind))


def fertilizer_options(facts: FarmQueueFacts, entries: list[dict]) -> dict | None:
    """One apply-or-not question. Kind, quantity and price stay in code."""
    if not entries:
        return None
    stocked = [kind for kind, row in facts.fertilizers.items() if row.get('quantity', 0) > 0]
    quoted = [kind for kind, row in facts.fertilizers.items()
              if (row.get('quote') or {}).get('price') not in (None, '')]
    if stocked:
        kind = _best_kind(facts, entries, stocked, True)
        name = facts.rules['fertilizers'][kind]['name']
        quantity = facts.fertilizers[kind]['quantity']
        return {'kind': kind, 'mode': 'optional', 'fact': f'手头{name}{quantity}袋',
                'choices': {'no': '不施肥', 'yes': f'施肥：{name}，手头{quantity}袋，有多少施多少'}}
    if not quoted:
        return None
    kind = _best_kind(facts, entries, quoted, False)
    need = sum(entry['quantity'] for entry in entries)
    amount = capped(facts, Decimal(need) * _unit_price(facts, kind))
    if Decimal(amount) <= 0:
        return None
    name = facts.rules['fertilizers'][kind]['name']
    return {'kind': kind, 'mode': 'required',
            'fact': f"手头没有肥料，{name}报价{_yuan(str(_unit_price(facts, kind)))}元",
            'choices': {'no': '现在种，不买肥',
                        'yes': f"买{name}后再种，约{_yuan(amount)}元，现在种不下，要等买到"}}


def _shopping_list(facts: FarmQueueFacts, targets: list[dict]) -> str:
    owned = _owned(facts)
    parts = []
    for entry in targets:
        extra = entry['quantity'] - owned.get(entry['sku'], 0)
        if extra > 0:
            parts.append(f"{crop_name(facts, entry['sku'])}×{extra}")
    return '、'.join(parts)


def _none_label(facts: FarmQueueFacts, targets: list[dict], mode: str, kind: str | None,
                amount: str) -> str:
    detail = _shopping_list(facts, targets)
    if not detail:
        return '不补种'
    return f'不补种，只买{detail}，采购上限{_yuan(amount)}元'


def restock_options(facts: FarmQueueFacts, entries: list[dict], mode: str = 'none',
                    kind: str | None = None) -> dict | None:
    """Seed-budget tiers; each tier carries the queue targets it stands for."""
    if facts.start >= facts.cutoff:
        return None
    if entries:
        by_sku = {crop['seed_sku']: crop for crop in facts.crops}
        crops = return_order(facts, [by_sku[entry['sku']] for entry in entries if entry['sku'] in by_sku])
        base_targets = entries
    elif facts.crops:
        # 空队列仍可补种：直接给出收益最高的真实作物，避免只有金额没有说话对象。
        crops = [crop for crop in return_order(facts, facts.crops)
                 if facts.seed_prices.get(crop['seed_sku'], Decimal(0)) > 0][:PURCHASE_CROPS]
        base_targets = []
    else:
        return None
    base = capped(facts, purchase_cost(facts, base_targets, mode, kind))
    tiers = {'none': {'limit': base, 'entries': base_targets,
                      'label': _none_label(facts, base_targets, mode, kind, base)}}
    for quantity, title in (('round', '再补一轮'), ('day', '补满今天')):
        targets = budgeted(facts, allocate(facts, crops, quantity, balanced=not entries, replenish=True))
        if not targets:
            continue
        amount = capped(facts, purchase_cost(facts, targets, mode, kind))
        if any(row['limit'] == amount for row in tiers.values()):
            continue
        detail = _shopping_list(facts, targets) or '补充种子'
        tiers[quantity] = {'limit': amount, 'entries': targets,
                           'label': f'{title}，{detail}，采购上限{_yuan(amount)}元'}
    if len(tiers) == 1:
        return None
    return tiers
