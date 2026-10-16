"""Load farm-only facts, choose a whole queue, and recheck before installation."""
import copy
from datetime import datetime
from decimal import Decimal
from statistics import median

from django.utils import timezone

from .farm_queue_candidates import FarmQueueFacts, build_candidates, identity
from .life_choices import choose
from .life_time import local_time


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
    reference_prices = [Decimal(str(row['price'])) for sku, row in quotes.items() if sku in prices]
    reference = median(reference_prices or list(prices.values()))
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
        seed_prices=prices, seed_price_sources=price_sources, reference_seed_price=reference,
        price_source=('空队列使用可见种子报价中位数；明确作物缺失报价时使用目录基准价'
                      if reference_prices else '缺少种子报价，使用目录基准价及其中位数'),
        spendable=available_cash(owner, agent.pk, exclude_ids=[slot['id']]),
        start=start, cutoff=cutoff,
    )


def decide_plan(agent, owner: str, slot: dict, reason: str, preferences: str = '') -> dict:
    from .execution import stamina
    from .farm_queue_estimate import plot_availability
    if not owner:
        raise ValueError('农场规划缺少居民账号范围')
    facts = planning_facts(owner, agent, slot)
    candidates = build_candidates(facts)
    templates, choices = {}, {}
    for key, row in candidates.items():
        template_id = identity(row['farm_plan']['entries'])
        templates.setdefault(template_id, {
            'entries': row['farm_plan']['entries'],
            **{k: v for k, v in row['summary'].items() if k != 'procurement_tier'},
        })
        choices[key] = {'plan_id': template_id,
                        'procurement_limit': row['farm_plan']['procurement_limit'],
                        'procurement_tier': row['summary'].get('procurement_tier', 'none')}
    owned = [crop for crop in facts.crops if crop['seed_quantity'] > 0]
    state = {'slot': {'id': slot['id'], 'time': local_time(datetime.fromisoformat(slot['time'])).isoformat()},
             'intent': reason, 'preferences': preferences, 'plans': templates,
             'start': facts.start.isoformat(), 'cutoff': facts.cutoff.isoformat(),
             'stamina': str(stamina(agent)),
             'plot_available_after_seconds': [max(0, point - facts.start.timestamp()) for point in
                 plot_availability(facts.state, facts.seed, facts.start.timestamp())],
             'spendable': str(facts.spendable), 'price_source': facts.price_source,
             'stocked_crops': [{**{k: crop[k] for k in ('seed_sku', 'name', 'seed_quantity', 'growth_seconds')},
                                'seed_reference_price': str(facts.seed_prices[crop['seed_sku']]),
                                'price_source': facts.seed_price_sources.get(crop['seed_sku'], facts.price_source)}
                               for crop in owned],
             'fertilizers': {k: {'quantity': v['quantity']} for k, v in facts.fertilizers.items()},
             'assumptions': '收益为估算，不是到账；缺肥可能等待，采购未执行且不保证供货。'
                            '肥料成本按当前库存批次估算；作物可跨日成熟。'
                            '容量未扣后续体力不足或忙碌的影响，实际完成量可能减少。'}
    selected = choose(agent, owner, 'farm_queue', state, choices)
    return copy.deepcopy(candidates[selected]['farm_plan'])


def recheck(item, specification: dict) -> dict:
    """Called inside the existing farm transaction, after the provider returns."""
    from .farm_catalog import catalog_for
    from .farm_plan_inventory import inventory_plan
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
    result['procurement_limit'] = str(min(limit, available_cash(
        item.owner_id, item.actor_id, exclude_ids=[item.pk])))
    scheduled = local_time(item.scheduled_at)
    end = window(effective_settings(config_for(item.owner_id), scheduled), scheduled.date())[1]
    if local_time(timezone.now()) >= end:
        result = {'entries': [], 'procurement_limit': '0.00'}
    return result
