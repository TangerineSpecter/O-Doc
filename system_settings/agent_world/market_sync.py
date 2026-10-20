"""同步校验市场完整资产状态，不以独立合并的钱包或背包补造交易。"""
import hashlib
import json
from django.core.serializers.json import DjangoJSONEncoder
from utils.sync_datetime import SyncJSONEncoder
from django.db.models.signals import post_save, post_delete
from .market_models import MarketConfig, MarketBatch, MarketListing, MarketSession, MarketTransaction, MarketIntegrity
from .market_plan_models import MarketPlan, MarketGoal, MarketDisposition, MarketNoBuy
from .farm_models import AgentFarm
from .travel_models import AgentInventoryItem

# 旧检查点曾只包含这六项；新增计划资产时必须允许一次性重建哈希。
CORE_ASSET_MODELS = (MarketBatch, MarketListing, MarketSession, MarketTransaction, AgentFarm, AgentInventoryItem)
PLAN_ASSET_MODELS = (MarketPlan, MarketGoal, MarketDisposition, MarketNoBuy)
ASSET_MODELS = CORE_ASSET_MODELS + PLAN_ASSET_MODELS
# 计划、目标、策略和不买清单与商店批次、挂牌、会话、成交共同决定恢复是否完整。
CHECKPOINT_MODELS = CORE_ASSET_MODELS[:4] + PLAN_ASSET_MODELS


def fingerprints(owner: str, *, legacy=False, models=None) -> dict[str, str]:
    result = {}
    for model in (ASSET_MODELS if models is None else models):
        rows = list(model.objects.filter(owner_id=owner).order_by('pk').values())
        if model is MarketBatch:
            # The added empty field must not invalidate original legacy checkpoint hashes.
            for row in rows:
                if not row['supplies']:
                    row.pop('supplies')
        result[model.__name__] = hashlib.sha256(json.dumps(rows, cls=DjangoJSONEncoder if legacy else SyncJSONEncoder,
            sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return result


def normalize_legacy_dates():
    """只转换与旧算法严格相符的派生摘要，不接受缺失或篡改的资产。"""
    for row in MarketIntegrity.objects.all():
        hashes = fingerprints(row.pk)
        if row.hashes == hashes:
            continue
        if row.hashes == fingerprints(row.pk, legacy=True):
            row.hashes = hashes
            row.save(update_fields=['hashes', 'updated_at'])
        elif row.hashes == fingerprints(row.pk, legacy=True, models=CORE_ASSET_MODELS):
            # 升级到日规划版本：旧检查点只覆盖六项核心资产，允许一次性重建。
            row.hashes = hashes
            row.save(update_fields=['hashes', 'updated_at'])


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
    for model in CHECKPOINT_MODELS: owners.update(model.objects.values_list('owner_id',flat=True))
    for owner in owners:
        has_market = any(model.objects.filter(owner_id=owner).exists() for model in CHECKPOINT_MODELS)
        checkpoint = MarketIntegrity.objects.filter(pk=owner).first()
        if (has_market and not checkpoint) or (checkpoint and checkpoint.hashes != fingerprints(owner)):
            raise SyncError('市场与背包、农场快照不完整或发生冲突，已拒绝恢复；请从停止执行的原设备重新同步')
    for listing in MarketListing.objects.all():
        if listing.item.get('quantity') != listing.remaining_quantity:
            raise SyncError('市场托管数量不一致')
        if any(not MarketTransaction.objects.filter(pk=k,owner_id=listing.owner_id).exists() for k in listing.operation_keys):
            raise SyncError('市场挂牌缺失关联交易')
        source = (listing.item or {}).get('source') or {}
        if source.get('kind') == 'combat_equipment':
            from .combat.models import EquipmentInstance, CombatProfile, CombatFact
            equipment_id = source.get('equipment_id')
            gear = EquipmentInstance.objects.filter(pk=equipment_id, owner_id=listing.owner_id).first()
            if not gear or (listing.item or {}).get('equipment_snapshot') != gear.snapshot:
                raise SyncError('冒险装备挂牌缺少装备实例来源')
            if listing.status == 'active':
                seller_profile = CombatProfile.objects.filter(pk=listing.seller_id, owner_id=listing.owner_id).first()
                if (gear.actor_id != listing.seller_id or gear.sold or gear.bound or gear.locked
                        or not seller_profile or gear.pk in seller_profile.loadout.values()):
                    raise SyncError('在售冒险装备已穿戴、转移或不可交易')
            elif listing.status == 'sold':
                bought = MarketTransaction.objects.filter(owner_id=listing.owner_id,
                    operation__kind='buy_listing', operation__listing_id=listing.pk).order_by('-created_at').first()
                if (not bought or bought.result.get('equipment_id') != gear.pk
                        or bought.result.get('seller_id') != listing.seller_id
                        or not CombatFact.objects.filter(owner_id=listing.owner_id,
                            actor_id=bought.actor_id, kind='gear_trade_in',
                            payload__transaction_id=bought.pk, payload__equipment_id=gear.pk,
                            payload__listing_id=listing.pk, payload__seller_id=listing.seller_id).exists()
                        or not CombatFact.objects.filter(owner_id=listing.owner_id,
                            actor_id=listing.seller_id, kind='gear_trade_out',
                            payload__transaction_id=bought.pk, payload__equipment_id=gear.pk,
                            payload__listing_id=listing.pk, payload__buyer_id=bought.actor_id).exists()):
                    raise SyncError('冒险装备挂牌成交缺少归属转移')
            elif listing.status == 'withdrawn':
                # Validate the historical return; the seller may have traded it again since.
                if not MarketTransaction.objects.filter(owner_id=listing.owner_id,
                        actor_id=listing.seller_id, operation__kind='withdraw',
                        operation__listing_id=listing.pk, result__equipment_id=gear.pk).exists():
                    raise SyncError('撤回的冒险装备缺少返还交易')
    for goal in MarketGoal.objects.select_related('plan'):
        if goal.plan.owner_id != goal.owner_id or goal.plan.actor_id != goal.actor_id:
            raise SyncError('市场目标与计划归属不一致')
        if goal.filled_quantity > goal.quantity:
            raise SyncError('市场目标完成数量超过需求')
    for row in MarketDisposition.objects.all():
        if row.sell_ratio + row.list_ratio > 100 or row.star_order not in ('high', 'low'):
            raise SyncError('市场处置策略比例无效')
    for row in MarketNoBuy.objects.all():
        from .combat.models import EquipmentInstance
        gear = EquipmentInstance.objects.filter(pk=row.equipment_id, owner_id=row.owner_id).first()
        if not gear or gear.sold:
            # 实例已出售或不存在时，不买标记不再具有业务含义。
            row.delete()
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
    trades = list(MarketTransaction.objects.select_related('session'))
    ledger_keys = [f'market:{trade.pk}:{delta["actor_id"]}' for trade in trades
                   for delta in trade.result.get('deltas', [])]
    WorldLedger.objects.filter(pk__startswith='market:').exclude(pk__in=ledger_keys).delete()
    listing_ids = {trade.operation.get('listing_id') for trade in trades
                   if isinstance(trade.operation, dict) and trade.operation.get('kind') == 'buy_listing'}
    listings = {row.pk: row for row in MarketListing.objects.filter(pk__in=listing_ids)}
    from .market_finance import farm_product_names, transaction_finance_kind
    names_by_owner = {}
    energy_keys = [hashlib.sha256(('market-energy:'+key).encode()).hexdigest()
        for key in MarketSession.objects.exclude(mode='archive').values_list('pk', flat=True)]
    WorldAction.objects.filter(snapshot__market_energy=True).exclude(pk__in=energy_keys).delete()
    for trade in trades:
        if trade.owner_id != trade.session.owner_id or trade.actor_id != trade.session.actor_id:
            raise SyncError('市场成交与会话归属不一致')
        for delta in trade.result.get('deltas',[]):
            if trade.owner_id not in names_by_owner:
                names_by_owner[trade.owner_id] = farm_product_names(trade.owner_id)
            operation = trade.operation if isinstance(trade.operation, dict) else {}
            listing = listings.get(operation.get('listing_id'))
            ledger_kind = transaction_finance_kind(
                trade, delta['actor_id'], delta['amount'], listing=listing,
                product_names=names_by_owner[trade.owner_id],
            )
            WorldLedger.objects.update_or_create(pk=f'market:{trade.pk}:{delta["actor_id"]}', defaults={
                'agent_id':delta['actor_id'],'agent_name':trade.actor_name if delta['actor_id']==trade.actor_id else
                    Agent.objects.filter(pk=delta['actor_id']).values_list('name',flat=True).first() or '',
                'kind':ledger_kind,
                'amount':delta['amount'],'created_at':trade.created_at,
                'snapshot':{'market_transaction_id':trade.pk}})
    for session in MarketSession.objects.all():
        if session.mode == 'archive':
            if session.status != 'closed' or session.call_count:
                raise SyncError('归档下架会话不得包含执行授权或工具调用')
            continue
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
