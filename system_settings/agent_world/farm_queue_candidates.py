"""Pure, bounded queue proposals. Estimates grant no resources or future purchases."""
import copy
import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field, replace
from datetime import datetime
from decimal import Decimal, ROUND_DOWN
from statistics import median

from .farm_queue_estimate import estimate, planting_time, plot_availability

MAX_PLANS = 80
FERTILIZER_PROFILES = ('none', 'optional_quality', 'optional_yield',
                       'required_quality', 'required_yield', 'economic')


@dataclass
class FarmQueueFacts:
    state: dict
    rules: dict
    seed: str
    crops: list[dict]
    fertilizers: dict
    seed_prices: dict[str, Decimal]
    price_source: str
    spendable: Decimal
    start: datetime
    cutoff: datetime
    reference_seed_price: Decimal | None = None
    seed_price_sources: dict[str, str] = field(default_factory=dict)


def identity(value: object) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


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


def fertilize(entries: list[dict], crops: dict, profile: str) -> list[dict]:
    result = []
    for entry in entries:
        mode, kind = 'none', None
        if profile == 'economic':
            options = crops[entry['sku']].get('fertilizers', {})
            gains = {k: v.get('inventory_additional_net_revenue', v.get('additional_net_revenue', 0))
                     for k, v in options.items()}
            if gains and max(gains.values()) > 0:
                kind = min(gains, key=lambda k: (-gains[k], k))
                mode = 'optional'
        elif profile != 'none':
            mode, kind = profile.split('_')
        result.append({**entry, 'fertilizer_mode': mode, 'fertilizer': kind})
    return result


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


def procurement(facts: FarmQueueFacts, crops: list[dict], profile: str, balanced: bool) -> list[dict]:
    if not crops and facts.crops:
        reference = {**facts.crops[0], 'seed_sku': 'seed.reference', 'seed_quantity': 0,
                     'growth_seconds': int(median(c['growth_seconds'] for c in facts.crops))}
        crops = [reference]
        rules = {**facts.rules, 'crops': {**facts.rules['crops'], 'reference': {
            'growth_seconds': reference['growth_seconds']}}}
        facts = replace(facts, rules=rules, seed_prices={
            'seed.reference': (facts.reference_seed_price if facts.reference_seed_price is not None
                               else median(list(facts.seed_prices.values())))})
    tiers = [{'tier': 'none', 'amount': '0.00'}]
    for quantity in ('round', 'day'):
        targets = fertilize(allocate(facts, crops, quantity, balanced, replenish=True),
                            {c['seed_sku']: c for c in crops}, profile)
        fert_need = Counter()
        cost = Decimal(0)
        by_sku = {c['seed_sku']: c for c in crops}
        for entry in targets:
            sku = entry['sku']
            cost += max(0, entry['quantity'] - by_sku[sku]['seed_quantity']) * facts.seed_prices[sku]
            if entry['fertilizer']:
                fert_need[entry['fertilizer']] += entry['quantity']
        for kind, count in fert_need.items():
            stock = facts.fertilizers[kind]
            price = Decimal(str((stock.get('quote') or {}).get('price')
                                or facts.rules['fertilizers'][kind]['base_price']))
            cost += max(0, count - stock['quantity']) * price
        amount = max(Decimal(0), min(cost, facts.spendable)).quantize(Decimal('.01'), rounding=ROUND_DOWN)
        tiers.append({'tier': quantity, 'amount': str(amount)})
    return tiers


def diverse(plans: list[dict]) -> list[dict]:
    """Bound the set by coverage, never by a profit-only truncation."""
    remaining = sorted(plans, key=lambda row: row['id'])
    result, covered = [], set()
    while remaining and len(result) < MAX_PLANS:
        row = min(remaining, key=lambda row: (-len(row['coverage'] - covered), row['id']))
        result.append(row)
        covered.update(row['coverage'])
        remaining.remove(row)
    return result


def build_candidates(facts: FarmQueueFacts) -> dict[str, dict]:
    if facts.start >= facts.cutoff:
        return {'empty': {'farm_plan': {'entries': [], 'procurement_limit': '0.00'},
                          'summary': {'reason': '没有剩余播种窗口'}}}
    owned = sorted((c for c in facts.crops if c['seed_quantity'] > 0), key=lambda c: c['seed_sku'])
    orders = [('single:' + c['seed_sku'], [c], False) for c in owned]
    if owned:
        orders += [
            ('fast', sorted(owned, key=lambda c: (c['growth_seconds'], c['seed_sku'])), False),
            ('return', sorted(owned, key=lambda c: (
                -(c['without_fertilizer']['expected_revenue'] - float(facts.seed_prices[c['seed_sku']]))
                / c['growth_seconds'], c['seed_sku'])), False),
            ('balanced', owned, True),
        ]
    plans = {}
    for family, crops, balanced in orders:
        for quantity in ('round', 'day'):
            entries = allocate(facts, crops, quantity, balanced)
            for profile in FERTILIZER_PROFILES:
                selected = fertilize(entries, {c['seed_sku']: c for c in crops}, profile)
                key = identity(selected)
                coverage = {('family', family), ('quantity', quantity), ('fertilizer', profile)}
                coverage.update(('crop', entry['sku']) for entry in selected)
                if key in plans:
                    plans[key]['coverage'].update(coverage)
                else:
                    plans[key] = {'id': key, 'entries': selected, 'coverage': coverage,
                                  'crops': crops, 'profile': profile, 'balanced': balanced,
                                  'summary': preview(facts, selected)}
    if not plans:
        # No owned seed is exposed as a planting target. Reference prices and
        # growth are only used to estimate a future replenishment allowance.
        reference = {'id': 'empty', 'entries': [], 'coverage': set(),
                     'crops': [], 'profile': 'none',
                     'balanced': False, 'summary': {'reason': '无可用种子，等待市场采购'}}
        plans['empty'] = reference
    result = {}
    for row in diverse(list(plans.values())):
        for tier in procurement(facts, row['crops'], row['profile'], row['balanced']):
            specification = {'entries': row['entries'], 'procurement_limit': tier['amount']}
            key = identity(specification)
            result.setdefault(key, {'farm_plan': copy.deepcopy(specification),
                                    'summary': {**row['summary'], 'procurement_tier': tier['tier']}})
    return result
