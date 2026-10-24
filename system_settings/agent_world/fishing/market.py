"""轮换鱼饵报价、日市场需求和可验证的交易收支标记。"""
import random
from decimal import Decimal
from .catalog import current
from .rules import level_for, preference
from .models import FishingConfig, FishingProfile
from .service import inventory


def bait_quote(owner: str, batch_id: str, seed: str) -> dict:
    rules = current(owner)
    rng = random.Random(f'{seed}:{batch_id}:fishing-bait-v1')
    bait = rng.choice(sorted(rules['baits']))
    rule = rules['baits'][bait]
    sku = 'bait.' + bait
    return {'id': sku, 'sku': sku, 'kind': 'bait', 'name': rule['name'], 'price': rule['price'],
            'version': 1, 'suitable_fish': [fish['name'] for fish in rules['fish'].values() if preference(fish, bait)]}


def needs(owner: str, agent, supplies: list[dict]) -> list[dict]:
    if not FishingConfig.objects.filter(pk=owner, enabled=True).exists():
        return []
    from ..life_scope import allowed
    from ..life_config import tasks_for
    if not any(t.task_kind == 'fishing' and t.enabled and allowed(t, agent.pk) for t in tasks_for(owner)):
        return []
    rules = current(owner)
    profile = FishingProfile.objects.filter(pk=agent.pk, owner_id=owner).first()
    level = level_for(profile.experience if profile else 0, rules['max_level'])[0]
    stock = inventory(owner, agent.pk)
    # A twelve-cast outing is a planning reference, never a shop purchase limit.
    usable = {bait for bait in rules['baits'] if any(preference(fish, bait) and
        rules['spots'][fish['spot']]['required_level'] <= level for fish in rules['fish'].values())}
    missing = max(0, 12 - sum(n for bait, n in stock.items() if bait in usable))
    if not missing:
        return []
    return [{'key': 'bait:' + q['sku'], 'kind': 'bait', 'sku': q['sku'], 'name': q['name'],
             'missing': missing, 'owned': stock.get(q['sku'][5:], 0), 'unit': '份',
             'unit_price': Decimal(q['price']), 'effect': '可钓：' + '、'.join(q.get('suitable_fish', []))}
            for q in supplies if q['kind'] == 'bait' and q['sku'][5:] in usable]


def annotate_trade(owner: str, operation: dict, result: dict) -> None:
    """鱼在背包与托管之间移动不改变所有权；真实交易记录双方收支。"""
    from ..market_models import MarketListing, MarketBatch
    kind = operation['kind']
    sku = result.get('fishing_sku', '')
    if kind == 'buy_shop':
        batch = MarketBatch.objects.get(pk=operation['batch_id'], owner_id=owner)
        quote = next((q for q in batch.supplies if q['id'] == operation['slot_id']), {})
        sku = quote.get('sku', '')
    elif kind in ('buy_listing', 'withdraw', 'reprice'):
        listing = MarketListing.objects.get(pk=operation['listing_id'], owner_id=owner)
        sku = listing.item.get('source', {}).get('sku', '')
    if sku.startswith(('bait.', 'fish.')):
        if not FishingConfig.objects.filter(pk=owner).exists():
            from .service import configure
            configure(owner, False)
        result['fishing_sku'] = sku
