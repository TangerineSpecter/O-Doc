"""Load farm-only facts, choose a queue in small steps, and recheck before installation."""
import copy
import time
from datetime import datetime
from decimal import Decimal

from django.utils import timezone

from .farm_queue_candidates import (FarmQueueFacts, capped, describe_basket, fertilizer_options,
                                    investment_options, purchase_baskets, purchase_cost, ranked_baskets,
                                    restock_options)
from .life_choices import choose
from .life_time import local_time

ON_HAND = '利用现有资源'


def available_cash(owner: str, actor: str, *, exclude_ids=()) -> Decimal:
    from system_settings.models import Agent
    from .life_models import LifeItem
    from .life_schedule import OPEN
    from .life_budget_policy import remaining_reservation
    agent = Agent.objects.get(pk=actor)
    others = LifeItem.objects.filter(owner_id=owner, actor_id=actor, status__in=OPEN).exclude(pk__in=exclude_ids)
    return max(Decimal(0), agent.money - sum((remaining_reservation(row) for row in others), Decimal(0)))


def planning_facts(owner: str, agent, slot: dict) -> FarmQueueFacts:
    from .farm_models import AgentFarm
    from .farm_catalog import catalog_for
    from .life_context import build_planning_farm_context
    from .life_config import config_for, effective_settings
    from .life_schedule import window
    from .market_shop import shop_payload

    scheduled = local_time(datetime.fromisoformat(slot['time']))
    start = max(local_time(timezone.now()), scheduled)
    config = config_for(owner)
    left, cutoff = window(effective_settings(config, scheduled), scheduled.date())
    start = max(start, left)
    context = build_planning_farm_context(owner, agent)
    farm = AgentFarm.objects.filter(pk=agent.pk, owner_id=owner).first()
    catalog = catalog_for(owner)
    quotes = {row['sku']: row for row in shop_payload(owner)['slots']
              if row['sku'].startswith('seed.')}
    prices, price_sources = {}, {}
    for kind, rule in catalog.rules['crops'].items():
        sku = 'seed.' + kind
        quote = quotes.get(sku)
        prices[sku] = Decimal(str(quote['price'] if quote else rule['seed_price']))
        price_sources[sku] = '可见报价' if quote else '目录基准价'
    fertilizers = context.get('planting', {}).get('fertilizers', {})
    from .inventory_stock import stock_rows
    for kind, stock in fertilizers.items():
        stock['cost_lots'] = [lot for row in stock_rows(agent.pk, owner, 'fertilizer.' + kind)
                              for lot in (row.source.get('lots') or [
                                  {'quantity': row.quantity, 'price': str(row.value)}])]
    # The full catalog stays local; only stocked crops and compact reference
    # estimates may cross the model boundary.
    return FarmQueueFacts(
        state=copy.deepcopy(farm.state) if farm else {'plots': [], 'animals': []},
        rules=catalog.rules, seed=catalog.seed,
        crops=context.get('planting', {}).get('crop_comparisons', []),
        fertilizers=fertilizers,
        seed_prices=prices, seed_price_sources=price_sources,
        spendable=available_cash(owner, agent.pk, exclude_ids=[slot['id']]),
        start=start, cutoff=cutoff,
    )


def _context(reason: str, preferences: str, **fields) -> dict:
    state = {}
    if reason:
        state['intent'] = reason
    if preferences:
        state['preferences'] = preferences
    state.update({key: value for key, value in fields.items() if value})
    return state


def _ask(agent, owner: str, state: dict, choices: dict, instructions: str, deadline: float,
         task=None) -> str:
    return choose(agent, owner, 'farm_queue', state, choices, task=task,
                  deadline=deadline, instructions=instructions)


def _stamp(entries: list[dict], mode: str, kind: str | None) -> list[dict]:
    return [{'sku': entry['sku'], 'quantity': entry['quantity'], 'fertilizer_mode': mode,
             'fertilizer': kind if mode != 'none' else None} for entry in entries]


def decide_plan(agent, owner: str, slot: dict, reason: str, preferences: str = '', *,
                task=None) -> dict:
    if not owner:
        raise ValueError('农场规划缺少居民账号范围')
    facts = planning_facts(owner, agent, slot)
    deadline = time.monotonic() + 180
    reason, preferences = reason or '', preferences or ''
    on_hand = ON_HAND in f'{reason}{preferences}'
    baskets = ranked_baskets(facts)
    if not baskets and not on_hand:
        # 手头没有种子时仍要给出可采购的真实作物，否则队列没有目标、市场也就没有缺口。
        baskets = purchase_baskets(facts)
    planting, bare = '', []
    if len(baskets) == 1:
        bare = baskets[0]['entries']
        planting = describe_basket(facts, baskets[0])
    elif baskets:
        choices = {str(index): describe_basket(facts, row) for index, row in enumerate(baskets, 1)}
        picked = _ask(agent, owner, _context(reason, preferences), choices,
                      '从这些种植组合里选一个。收益是估算，采购还没发生。', deadline, task)
        bare = baskets[int(picked) - 1]['entries']
        planting = choices[picked]
    mode, kind, fertilizer_label = 'none', None, ''
    question = fertilizer_options(facts, bare)
    if question:
        picked = _ask(agent, owner, _context(reason, preferences, planting=planting, fertilizer=question['fact']),
                      question['choices'], '决定这一批施不施肥。', deadline, task)
        fertilizer_label = question['choices'][picked]
        if picked == 'yes':
            mode, kind = question['mode'], question['kind']
    entries = _stamp(bare, mode, kind)
    limit = capped(facts, purchase_cost(facts, entries, mode, kind))
    # The schedule already asked to use what is on hand. Do not ask to buy seeds again.
    if not on_hand:
        options = restock_options(facts, bare, mode, kind)
        if options:
            note = '肥料决定已经作出。' if fertilizer_label else ''
            picked = _ask(agent, owner, _context(
                reason, preferences, planting=planting or '手头没有可种的种子', fertilizer=fertilizer_label),
                {key: row['label'] for key, row in options.items()},
                note + '决定要不要再买种子。金额是采购上限，还没购买。', deadline, task)
            limit = options[picked]['limit']
            # 补种档位也带着真实目标；只改金额会让队列永远等不到可种的东西。
            if options[picked].get('entries'):
                entries = _stamp(options[picked]['entries'], mode, kind)
    investment = None
    question = investment_options(facts, Decimal(limit), on_hand=on_hand)
    if question:
        picked = _ask(agent, owner, _context(reason, preferences,
                                             planting=planting or '手头没有可种的种子',
                                             fertilizer=fertilizer_label,
                                             investment=question['fact']),
                      question['choices'],
                      '决定今天剩下的额度要不要投到土地或建筑。金额与可执行性由程序按目录现价复核，选中后只在当天开工时执行一次。',
                      deadline, task)
        investment = question['options'].get(picked)
    result = {'entries': entries, 'procurement_limit': limit}
    if investment:
        result['investment'] = investment
    return result


def recheck(item, specification: dict) -> dict:
    """Called inside the existing farm transaction, after the provider returns."""
    from .farm_catalog import catalog_for
    from .farm_models import AgentFarm
    from .farm_plan_inventory import inventory_plan
    from .farm_queue_plan import investment_for
    from .inventory_stock import stock_quantity
    from .life_budget import money
    from .life_config import config_for, effective_settings
    from .life_schedule import window
    from system_settings.models import Agent

    Agent.objects.select_for_update().get(pk=item.actor_id)
    catalog = catalog_for(item.owner_id)
    comparisons = [{'seed_sku': 'seed.' + kind,
                    'seed_quantity': stock_quantity(item.actor_id, item.owner_id, 'seed.' + kind)}
                   for kind in catalog.rules['crops']]
    result = inventory_plan(specification, comparisons)
    limit = money(result.get('procurement_limit', '0'))
    if limit < 0:
        raise ValueError('采购上限不能为负数')
    farm = AgentFarm.objects.filter(pk=item.actor_id, owner_id=item.owner_id).first()
    cash = available_cash(item.owner_id, item.actor_id, exclude_ids=[item.pk])
    investment = investment_for(result.get('investment'), farm.state if farm else {}, catalog.rules, cash)
    if investment:
        result['investment'] = investment
        cash = max(Decimal(0), cash - Decimal(investment['cost']))
    else:
        result.pop('investment', None)
    limit = min(limit, cash)
    result['procurement_limit'] = str(limit)
    result['entries'] = affordable_targets(result['entries'], comparisons, catalog, limit)
    scheduled = local_time(item.scheduled_at)
    end = window(effective_settings(config_for(item.owner_id), scheduled), scheduled.date())[1]
    if local_time(timezone.now()) >= end:
        result = {'entries': [], 'procurement_limit': '0.00'}
    return result


def affordable_targets(entries: list[dict], comparisons: list[dict], catalog, limit) -> list[dict]:
    """采购目标不超过采购上限：现有种子照留，待购部分按目录种子价截断。"""
    stock = {row['seed_sku']: int(row['seed_quantity']) for row in comparisons}
    remaining, kept = limit, []
    for entry in entries:
        owned = stock.get(entry['sku'], 0)
        extra = max(0, entry['quantity'] - owned)
        rule = catalog.rules['crops'].get(entry['sku'][5:]) or {}
        price = Decimal(str(rule.get('seed_price') or 0))
        buy = 0
        if extra and price > 0:
            buy = min(extra, int(remaining // price))
            remaining -= price * buy
        elif extra:
            buy = extra
        total = min(entry['quantity'], owned + buy)
        stock[entry['sku']] = max(0, owned - total)
        if total > 0:
            kept.append({**entry, 'quantity': total})
    return kept
