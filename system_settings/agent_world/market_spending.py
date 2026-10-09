"""采购前的实时额度反馈；成交事务仍负责最终资金与库存校验。"""
from decimal import Decimal
from system_settings.models import Agent
from .life_budget_policy import remaining_reservation
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_scope import CURRENT
from .market_models import MarketTransaction, MarketListing
from .market_shop import current_batch


class MarketPurchaseBlocked(ValueError):
    def __init__(self, code: str, message: str, context: dict):
        super().__init__(message)
        self.result = {'error': message, 'code': code, 'spending': context}


def spending_context(owner: str, actor: str) -> dict:
    agent = Agent.objects.get(pk=actor)
    batch = current_batch(owner)
    bought = sorted(set(str(v) for v in MarketTransaction.objects.filter(
        owner_id=owner, actor_id=actor, operation__kind='buy_shop', operation__batch_id=batch.pk
    ).exclude(operation__slot_id__in=['feed', *[s['id'] for s in batch.supplies]]).values_list('operation__slot_id', flat=True)))
    result = {'balance': str(agent.money), 'spendable': str(agent.money), 'batch_id': batch.pk,
              'purchased_slot_ids': bought, 'slots_remaining': max(0, 2-len(bought)),
              'feed_uses_slot': False, 'fertilizer_uses_slot': False}
    scope = CURRENT.get()
    if scope and scope['actor_id'] == actor and scope['owner_id'] == owner:
        item = LifeItem.objects.get(pk=scope['item_id'], actor_id=actor, owner_id=owner)
        others = LifeItem.objects.filter(owner_id=owner, actor_id=actor, status__in=OPEN).exclude(pk=item.pk)
        reserved = sum((remaining_reservation(r) for r in others), Decimal(0))
        result.update(item_id=item.pk, budget=str(item.budget), spent=str(item.spent),
                      reserved_for_others=str(reserved),
                      spendable=str(max(Decimal(0), min(remaining_reservation(item), agent.money-reserved))))
    return result


def check_purchase(owner: str, actor: str, operation: dict) -> None:
    if operation['kind'] not in ('buy_shop', 'buy_listing'):
        return
    from .market_service import price, quantity
    count = quantity(operation.get('quantity'))
    context = spending_context(owner, actor)
    if operation['kind'] == 'buy_shop':
        batch = current_batch(owner)
        if operation.get('batch_id') != batch.pk:
            return  # 报价及库存错误沿用成交服务的校验与记录。
        slot = operation.get('slot_id')
        supply = next((r for r in batch.supplies if r['id'] == slot), None)
        item = next((r for r in batch.slots if r['id'] == slot), None)
        if slot == 'feed':
            unit_price = batch.feed_price
        elif supply:
            unit_price = price(supply['price'])
        elif item:
            if slot not in context['purchased_slot_ids'] and context['slots_remaining'] == 0:
                raise MarketPurchaseBlocked('market_slot_limit', '本小时商品格额度已用尽；只能购买已选商品格的剩余库存、常驻农资或居民挂牌，不能重复尝试新商品格。', context)
            unit_price = price(item['price'])
        else:
            return
    else:
        listing = MarketListing.objects.filter(pk=operation.get('listing_id'), owner_id=owner,
                                              status='active', version=operation.get('version')).first()
        if not listing:
            return
        unit_price = listing.unit_price
    amount = unit_price * count
    if amount > Decimal(context['spendable']):
        message = f"本次需{amount}币，当前可消费{context['spendable']}币；"
        message += '请先调用adjust_life_budget说明原因调整预算，或减少数量、放弃购买；条件未变化时不可重试。' if 'item_id' in context else '请减少数量或放弃购买，余额不足不能重试。'
        raise MarketPurchaseBlocked('life_budget_exceeded' if 'item_id' in context else 'insufficient_balance', message, context)
