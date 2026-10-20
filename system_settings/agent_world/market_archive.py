"""归档的管理下架：保留交易依据，不产生模型执行或体力消费。"""
import hashlib

from .market_models import MarketListing, MarketSession, MarketTransaction
from .market_plan_models import (MarketDisposition, MarketDispositionTask, MarketGoal,
                                 MarketNoBuy, MarketPlan, MarketTick)
from .market_service import withdraw_listing


def withdraw_for_archive(agent, now):
    sessions = {}
    listings = MarketListing.objects.select_for_update().filter(seller_id=agent.pk, status='active').order_by('pk')
    for listing in listings:
        if listing.owner_id not in sessions:
            identity = hashlib.sha256(f'archive:{agent.pk}:{now.isoformat()}:{listing.owner_id}'.encode()).hexdigest()
            sessions[listing.owner_id] = MarketSession.objects.create(
                pk=identity, owner_id=listing.owner_id, actor_id=agent.pk, actor_name=agent.name,
                mode='archive', status='closed', created_at=now, expires_at=now, ended_at=now,
                reason='居民归档，管理下架，不消耗体力',
            )
        session = sessions[listing.owner_id]
        key = hashlib.sha256(f'{session.pk}:{listing.pk}:{listing.version}'.encode()).hexdigest()
        operation = {'kind': 'withdraw', 'listing_id': listing.pk, 'version': listing.version, 'reason': 'agent_archive'}
        result = withdraw_listing(listing, agent, key)
        result.update(kind='withdraw', listing_id=listing.pk, version=listing.version, unit_price=str(listing.unit_price),
                      balance=str(agent.money), deltas=[])
        MarketTransaction.objects.create(pk=key, owner_id=listing.owner_id, session=session,
                                         actor_id=agent.pk, actor_name=agent.name, operation=operation, result=result,
                                         created_at=now)
    # 归档后不再有自动规划或处置；本机队列与业务策略一并清理。
    for model in (MarketDispositionTask, MarketTick, MarketNoBuy, MarketDisposition, MarketGoal, MarketPlan):
        model.objects.filter(actor_id=agent.pk).delete()
