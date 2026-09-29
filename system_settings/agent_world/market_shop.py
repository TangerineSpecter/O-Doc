"""整点报价只生成一次，随机权重从购买单价计算。"""
import hashlib
import random
import uuid
from datetime import timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo
from django.db import transaction
from django.conf import settings
from django.utils import timezone
from .farm_catalog import catalog_for
from .farm_gate import guarded
from .market_models import MarketConfig, MarketBatch


def config_for(owner: str) -> MarketConfig:
    return MarketConfig.objects.get_or_create(pk=owner, defaults={'seed': uuid.uuid4().hex})[0]


def product_pool(rules: dict) -> list[dict]:
    return ([{'sku': 'seed.'+k, 'name': v['name']+'种子', 'kind': 'seed', 'price': str(v['seed_price'])}
             for k, v in rules['crops'].items()] +
            [{'sku': 'animal.'+k, 'name': v['name'], 'kind': 'animal', 'price': str(v['price']), 'rules': v}
             for k, v in rules['animals'].items()])


def price_weights(products: list[dict]) -> list[float]:
    return [1 / float(Decimal(p['price']).sqrt()) for p in products]


@guarded
@transaction.atomic
def current_batch(owner: str, now=None) -> MarketBatch:
    now = now or timezone.now()
    aware_now = timezone.make_aware(now, timezone.get_default_timezone()) if timezone.is_naive(now) else now
    start = aware_now.astimezone(ZoneInfo('Asia/Shanghai')).replace(minute=0, second=0, microsecond=0)
    key = hashlib.sha256(f'market:{owner}:{start.isoformat()}'.encode()).hexdigest()
    previous = MarketBatch.objects.filter(pk=key).first()
    if previous:
        return previous
    config = config_for(owner)
    rules = catalog_for(owner).rules
    pool = product_pool(rules)
    rng = random.Random(f'{config.seed}:{key}')
    slots = []
    from .life_models import LifeConfig
    from .life_config import effective_settings
    life_config=LifeConfig.objects.filter(pk=owner,migrated=True).first()
    slot_count=2*len(effective_settings(life_config,aware_now).get('agent_ids',[])) if life_config else config.slot_count
    for index in range(slot_count):
        item = dict(rng.choices(pool, weights=price_weights(pool))[0])
        quantity = rng.randint(1, 3) if item['kind'] == 'seed' else 1
        slots.append({**item, 'id': str(index), 'initial_quantity': quantity, 'remaining_quantity': quantity})
    stored_start = start if settings.USE_TZ else timezone.make_naive(start, timezone.get_default_timezone())
    return MarketBatch.objects.create(pk=key, owner_id=owner, starts_at=stored_start, expires_at=stored_start+timedelta(hours=1),
                                      slots=slots, feed_price=rules['feed_price'])


def market_iso(value):
    if timezone.is_naive(value): value = timezone.make_aware(value, timezone.get_default_timezone())
    return value.isoformat()


def shop_payload(owner: str, now=None) -> dict:
    batch = current_batch(owner, now)
    return {'id': batch.pk, 'starts_at': market_iso(batch.starts_at), 'expires_at': market_iso(batch.expires_at),
            'slots': batch.slots, 'feed': {'sku': 'feed', 'name': '饲料', 'price': str(batch.feed_price)},
            'server_time': market_iso(now or timezone.now())}
