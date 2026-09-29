"""同步校验市场完整资产状态，不以独立合并的钱包或背包补造交易。"""
import hashlib
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models.signals import post_save, post_delete
from .market_models import MarketConfig, MarketBatch, MarketListing, MarketSession, MarketTransaction, MarketIntegrity
from .farm_models import AgentFarm
from .travel_models import AgentInventoryItem

ASSET_MODELS = (MarketBatch, MarketListing, MarketSession, MarketTransaction, AgentFarm, AgentInventoryItem)


def fingerprints(owner: str) -> dict[str, str]:
    return {model.__name__:hashlib.sha256(json.dumps(list(model.objects.filter(owner_id=owner).order_by('pk').values()),
            cls=DjangoJSONEncoder, sort_keys=True, separators=(',', ':')).encode()).hexdigest() for model in ASSET_MODELS}


def update_checkpoint(sender, instance, **kwargs):
    from system_settings.sync_state import is_tracking_suspended
    if is_tracking_suspended() or kwargs.get('raw'): return
    owner = getattr(instance, 'owner_id', None)
    if owner and MarketConfig.objects.filter(pk=owner).exists():
        MarketIntegrity.objects.update_or_create(pk=owner, defaults={'hashes':fingerprints(owner)})


def register_market_signals():
    for model in ASSET_MODELS:
        for signal in (post_save, post_delete):
            signal.connect(update_checkpoint, sender=model, weak=False,
                           dispatch_uid=f'market-checkpoint:{model.__name__}:{signal}')


def reconcile_market() -> None:
    from utils.sync_manager import SyncError
    from system_settings.models import Agent, WorldAction
    from .models import WorldLedger
    from django.db.models import Sum
    owners = set(MarketConfig.objects.values_list('pk',flat=True))
    owners.update(MarketIntegrity.objects.values_list('pk', flat=True))
    for model in ASSET_MODELS[:4]: owners.update(model.objects.values_list('owner_id',flat=True))
    for owner in owners:
        has_market = any(model.objects.filter(owner_id=owner).exists() for model in ASSET_MODELS[:4])
        checkpoint = MarketIntegrity.objects.filter(pk=owner).first()
        if (has_market and not checkpoint) or (checkpoint and checkpoint.hashes != fingerprints(owner)):
            raise SyncError('市场与背包、农场快照不完整或发生冲突，已拒绝恢复；请从停止执行的原设备重新同步')
    for listing in MarketListing.objects.all():
        if listing.item.get('quantity') != listing.remaining_quantity:
            raise SyncError('市场托管数量不一致')
        if any(not MarketTransaction.objects.filter(pk=k,owner_id=listing.owner_id).exists() for k in listing.operation_keys):
            raise SyncError('市场挂牌缺失关联交易')
    for batch in MarketBatch.objects.all():
        if any(not MarketTransaction.objects.filter(pk=k,owner_id=batch.owner_id).exists() for k in batch.purchase_keys):
            raise SyncError('商店库存缺失关联成交')
    for item in AgentInventoryItem.objects.all():
        trade_id = item.source.get('market_trade_id')
        if trade_id and not MarketTransaction.objects.filter(pk=trade_id,owner_id=item.owner_id,actor_id=item.actor_id).exists():
            raise SyncError('背包物品缺失市场转移依据')
    for farm in AgentFarm.objects.all():
        for animal in farm.state.get('animals',[]):
            trade_id = animal.get('market_trade_id')
            if trade_id and not MarketTransaction.objects.filter(pk=trade_id,owner_id=farm.owner_id,actor_id=farm.pk).exists():
                raise SyncError('农场动物缺失关联成交')
        for key in farm.state.get('market_purchase_keys',[]):
            trade = MarketTransaction.objects.filter(pk=key,owner_id=farm.owner_id,actor_id=farm.pk).first()
            if not trade or trade.operation.get('kind') != 'buy_shop': raise SyncError('农场动物缺失市场购买依据')
    ledger_keys = [f'market:{trade.pk}:{delta["actor_id"]}' for trade in MarketTransaction.objects.all()
                   for delta in trade.result.get('deltas', [])]
    WorldLedger.objects.filter(kind='market').exclude(pk__in=ledger_keys).delete()
    energy_keys = [hashlib.sha256(('market-energy:'+key).encode()).hexdigest()
                   for key in MarketSession.objects.values_list('pk', flat=True)]
    WorldAction.objects.filter(snapshot__market_energy=True).exclude(pk__in=energy_keys).delete()
    for trade in MarketTransaction.objects.select_related('session'):
        if trade.owner_id != trade.session.owner_id or trade.actor_id != trade.session.actor_id:
            raise SyncError('市场成交与会话归属不一致')
        for delta in trade.result.get('deltas',[]):
            WorldLedger.objects.update_or_create(pk=f'market:{trade.pk}:{delta["actor_id"]}', defaults={
                'agent_id':delta['actor_id'],'agent_name':trade.actor_name if delta['actor_id']==trade.actor_id else
                    Agent.objects.filter(pk=delta['actor_id']).values_list('name',flat=True).first() or '',
                'kind':'market','amount':delta['amount'],'created_at':trade.created_at,
                'snapshot':{'market_transaction_id':trade.pk}})
    for session in MarketSession.objects.all():
        WorldAction.objects.update_or_create(pk=hashlib.sha256(('market-energy:'+session.pk).encode()).hexdigest(), defaults={'actor_id':session.actor_id,
            'task':session.task,'status':'success','consumed_at':session.created_at,'energy_cost':5,'effects_done':True,
            'snapshot':{'market_energy':True},'result':{'session_id':session.pk}})
    for agent in Agent.objects.all():
        balance = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total']
        if balance is not None:
            agent.money=balance; agent.save(update_fields=['money'])


def end_restored_sessions():
    """Restore never transfers authorization from a pre-import local model loop."""
    from system_settings.models import AgentExecutionLease
    from .market_models import MarketRuntime
    from .market_sessions import close_session
    tokens = list(MarketRuntime.objects.values_list('agent_token', flat=True))
    if tokens:
        AgentExecutionLease.objects.filter(token__in=tokens).update(token='', until=None)
    MarketRuntime.objects.all().delete()
    for session in MarketSession.objects.filter(status='active'):
        close_session(session, '快照恢复，市场会话已结束')


def refresh_restored_checkpoints():
    """Only after validated restore: accept deterministic legacy farm normalization."""
    for owner in MarketConfig.objects.values_list('pk', flat=True):
        MarketIntegrity.objects.update_or_create(pk=owner, defaults={'hashes':fingerprints(owner)})
