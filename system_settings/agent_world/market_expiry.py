"""系统管理下架：原子返还到期挂牌，不进入市场也不消耗体力。"""
import hashlib
import logging
from django.core.cache import cache

from django.db import transaction
from django.utils import timezone

from system_settings.models import Agent

from .farm_gate import guarded
from .life_time import local_time, storage_time
from .market_listing_expiry import EXPIRY_REASON, is_expired
from .market_models import MarketListing, MarketSession, MarketTransaction
from .market_service import withdraw_listing

logger = logging.getLogger(__name__)


@guarded
@transaction.atomic
def expire_listing(listing_id: str, now=None) -> bool:
    """在资产锁内复核期限；失败时会话、库存、挂牌和交易一起回滚。"""
    now = now or timezone.now()
    listing = MarketListing.objects.select_for_update().filter(pk=listing_id, status='active').first()
    if not listing or not is_expired(listing, now):
        return False
    agent = Agent.objects.select_for_update().filter(pk=listing.seller_id).first()
    if not agent:
        raise ValueError('挂牌卖家不存在，无法安全返还托管物品')

    # 同一轮同一卖家的下架共用管理会话，避免每件商品在市场动态产生一条独立活动。
    identity = hashlib.sha256(
        f'market-expiry-session:{listing.owner_id}:{agent.pk}:{storage_time(now).isoformat()}'.encode()
    ).hexdigest()
    session, _ = MarketSession.objects.get_or_create(pk=identity, defaults={
        'owner_id': listing.owner_id, 'actor_id': agent.pk, 'actor_name': agent.name,
        # Existing management mode is understood by older sync clients as no-energy.
        'mode': 'archive', 'status': 'closed', 'created_at': now, 'expires_at': now, 'ended_at': now,
        'reason': '挂牌到期自动下架，不消耗体力',
    })
    if session.owner_id != listing.owner_id or session.actor_id != agent.pk or session.mode != 'archive':
        raise ValueError('到期下架会话归属无效')
    key = hashlib.sha256(f'market-expiry:{listing.pk}:{listing.version}'.encode()).hexdigest()
    operation = {'kind': 'withdraw', 'listing_id': listing.pk, 'version': listing.version,
                 'reason': EXPIRY_REASON}
    result = withdraw_listing(listing, agent, key)
    result.update(kind='withdraw', listing_id=listing.pk, version=listing.version,
                  unit_price=str(listing.unit_price), balance=str(agent.money), deltas=[])
    from .fishing.market import annotate_trade
    annotate_trade(listing.owner_id, operation, result)
    MarketTransaction.objects.create(pk=key, owner_id=listing.owner_id, session=session,
                                     actor_id=agent.pk, actor_name=agent.name,
                                     operation=operation, result=result, created_at=now)
    return True


def expire_due(now=None, *, limit: int = 50) -> int:
    """Reuse deadline projections, bound attempts and back off failed returns."""
    from .market_expiry_index import active_deadlines
    if type(limit) is not int or not 1 <= limit <= 1000:
        raise ValueError('到期下架批量须为1至1000')
    now = now or timezone.now()
    local_now = local_time(now)
    done, attempted = 0, 0
    owners = MarketListing.objects.filter(status='active').order_by('owner_id').values_list('owner_id', flat=True).distinct()
    for owner in owners:
        for identity, version, deadline in active_deadlines(owner):
            if deadline > local_now:
                continue
            retry_key = 'market-expiry-retry:' + hashlib.sha256(f'{owner}:{identity}:{version}:{deadline.isoformat()}'.encode()).hexdigest()
            if cache.get(retry_key):
                continue
            attempted += 1
            try:
                done += int(expire_listing(identity, now))
            except Exception:  # Keep escrow intact; retry failures once per ten minutes/version.
                cache.set(retry_key, True, timeout=600)
                logger.exception('市场挂牌到期下架失败 listing=%s', identity)
            if done >= limit or attempted >= limit * 4:
                return done
    return done
