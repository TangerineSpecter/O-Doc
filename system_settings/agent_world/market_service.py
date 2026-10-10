"""所有资金与资产变化仅由短事务执行，模型不能自行修改账目。"""
import copy
from decimal import Decimal, InvalidOperation
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from system_settings.models import Agent
from .farm_gate import guarded
from .farm_models import AgentFarm
from .farm_clock import advance_state
from .farm_catalog import catalog_for
from .farm_service import perform
from .inventory_stock import add_stock
from .travel_models import AgentInventoryItem
from .income import ensure_opening
from .models import WorldLedger
from .market_models import MarketSession, MarketListing, MarketTransaction, MarketBatch
from .market_sessions import check_mcp
from .market_shop import current_batch
from .market_inventory import split_item, split_escrow, deliver


def quantity(value):
    if type(value) is not int or not 1 <= value <= 1000000:
        raise ValueError('数量必须为 1 至 1000000 的整数')
    return value


def price(value):
    if isinstance(value, bool): raise ValueError('价格无效')
    try: result = Decimal(str(value))
    except (InvalidOperation, ValueError): raise ValueError('价格无效')
    if not result.is_finite() or result <= 0 or result > Decimal('9999999999.99') or result != result.quantize(Decimal('.01')):
        raise ValueError('价格须为有效正数，最多两位小数')
    return result


def change_money(agent, amount, key, at):
    ensure_opening(agent)
    balance = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total'] or Decimal(0)
    if balance+amount < 0 or balance+amount > Decimal('9999999999.99'):
        raise ValueError('余额不足或余额超出范围')
    if amount < 0:
        from .life_budget import charge_budget
        charge_budget(agent,-amount,business_key=f'market:{key}:{agent.pk}')
    if amount:
        WorldLedger.objects.create(pk=f'market:{key}:{agent.pk}', agent_id=agent.pk, agent_name=agent.name,
            kind='market', amount=amount, created_at=at, snapshot={'market_transaction_id': key})
        agent.money = balance+amount
        agent.save(update_fields=['money'])


def tradable(item):
    sku = item.source.get('sku', '')
    return item.kind == 'souvenir' or sku.startswith(('crop.', 'product.', 'dish.'))


def check_session(session, at):
    from .market_sessions import invalid_reason
    reason = invalid_reason(session, at)
    # The twentieth accepted call is permitted to finish, then the adapter closes the session.
    if reason and not (session.call_count == 20 and reason == '市场会话达到二十次工具调用上限'):
        raise ValueError(reason)


@guarded
@transaction.atomic
def trade(session: MarketSession, agent: Agent, key: str, operation: dict, now=None) -> dict:
    if not isinstance(operation,dict) or not isinstance(operation.get('kind'),str):raise ValueError('交易操作格式无效')
    check_mcp()
    at = now or timezone.now()
    session = MarketSession.objects.select_for_update().get(pk=session.pk, actor_id=agent.pk)
    old = MarketTransaction.objects.filter(pk=key).first()
    if old:
        if old.session_id != session.pk or old.operation != operation:
            raise ValueError('交易请求键已用于不同参数')
        return old.result
    check_session(session, at)
    agent = Agent.objects.select_for_update().get(pk=agent.pk)
    owner, kind = session.owner_id, operation['kind']
    result = {'kind': kind}
    deltas = []
    if kind in ('buy_potion','sell_combat_material','sell_combat_equipment'):
        from .combat.market import transact
        result.update(transact(owner,agent,key,operation,change_money,at))
        deltas = result['deltas']
    elif kind == 'buy_shop':
        batch = current_batch(owner, at)
        if operation.get('batch_id') != batch.pk: raise ValueError('报价已过期，请刷新商店')
        batch = MarketBatch.objects.select_for_update().get(pk=batch.pk)
        count = quantity(operation.get('quantity'))
        slot_id = operation.get('slot_id')
        slots = copy.deepcopy(batch.slots)
        constant_ids = {'feed', *[s['id'] for s in batch.supplies]}
        item = ({'sku':'feed','name':'饲料','kind':'feed','price':str(batch.feed_price)} if slot_id == 'feed' else
                next((s for s in [*slots, *batch.supplies] if s['id'] == slot_id), None))
        if not item: raise ValueError('商品位不存在')
        if slot_id not in constant_ids and count > item['remaining_quantity']: raise ValueError('商品库存不足')
        if slot_id not in constant_ids:
            bought = set(str(value) for value in MarketTransaction.objects.filter(owner_id=owner,actor_id=agent.pk,operation__kind='buy_shop',operation__batch_id=batch.pk).exclude(operation__slot_id__in=constant_ids).values_list('operation__slot_id',flat=True))
            if slot_id not in bought and len(bought)>=2:
                raise ValueError('本小时最多购买两个商品格，常驻农资不占额度')
        amount = price(item['price'])*count
        change_money(agent, -amount, key, at)
        if item['kind'] == 'animal':
            if count != 1: raise ValueError('动物每个商品位仅一只')
            farm = AgentFarm.objects.select_for_update().filter(pk=agent.pk, owner_id=owner).first()
            if not farm: raise ValueError('请先启用农场并建造对应建筑')
            rules = copy.deepcopy(catalog_for(owner).rules)
            animal = item['sku'].split('.',1)[1]
            rules['animals'][animal] = item['rules']
            advance_state(farm.state, catalog_for(owner).seed, at.timestamp())
            perform(farm, {'kind':'buy_animal','animal':animal}, rules, at.timestamp(), key)
            farm.state['animals'][-1]['market_trade_id'] = key
            result['animal_id'] = farm.state['animals'][-1]['id']
            farm.state['market_purchase_keys'] = [*farm.state.get('market_purchase_keys', []), key]
            farm.revision += 1; farm.updated_at = at
            farm.save(update_fields=['state','revision','updated_at'])
        else:
            stock = add_stock(agent.pk, owner, agent.name, item['sku'], count, item['name'], 'farm_seed' if item['kind']=='seed' else 'farm_supply', Decimal(item['price']), key)
            result['item_id'] = stock.pk
        if slot_id not in constant_ids: item['remaining_quantity'] -= count
        batch.slots, batch.purchase_keys = slots, [*batch.purchase_keys, key]
        batch.save(update_fields=['slots','purchase_keys','updated_at'])
        result.update(name=item['name'], quantity=count, total=str(amount), unit_price=item['price'], batch_id=batch.pk, slot_id=slot_id)
        deltas.append({'actor_id':agent.pk,'amount':str(-amount)})
    elif kind in ('sell', 'list'):
        item = AgentInventoryItem.objects.select_for_update().filter(pk=operation.get('item_id'), actor_id=agent.pk, owner_id=owner).first()
        if not item or not tradable(item): raise ValueError('物品不存在或不可交易')
        count = quantity(operation.get('quantity'))
        if kind == 'sell' and not item.source.get('sku','').startswith(('crop.','product.','dish.')):
            raise ValueError('商店仅回收农作物、畜产品及美食')
        payload = split_item(item, count)
        result.update(name=payload['name'], quantity=count, stars=payload['source'].get('stars'))
        if kind == 'sell':
            lots = payload['source'].get('lots')
            amount = sum((Decimal(l['price'])*l['quantity'] for l in lots), Decimal(0)) if lots else Decimal(payload['value'])*count
            if amount < 0: raise ValueError('回收价无效')
            change_money(agent, amount, key, at)
            deltas.append({'actor_id':agent.pk,'amount':str(amount)})
            result['total'] = str(amount)
        else:
            listing = MarketListing.objects.create(pk=key, owner_id=owner, seller_id=agent.pk, seller_name=agent.name,
                item=payload, initial_quantity=count, remaining_quantity=count, unit_price=price(operation.get('unit_price')),
                operation_keys=[key], created_at=at)
            result.update(listing_id=listing.pk, unit_price=str(listing.unit_price))
    elif kind in ('buy_listing', 'reprice', 'withdraw'):
        listing = MarketListing.objects.select_for_update().filter(pk=operation.get('listing_id'), owner_id=owner).first()
        if not listing or listing.status != 'active': raise ValueError('挂牌不存在或已结束')
        if type(operation.get('version')) is not int or operation['version'] != listing.version:
            raise ValueError('挂牌报价或库存已变化，请重新查询')
        if kind == 'buy_listing':
            if listing.seller_id == agent.pk: raise ValueError('不能购买自己的商品')
            count = quantity(operation.get('quantity'))
            seller = Agent.objects.select_for_update().filter(pk=listing.seller_id).first()
            if not seller: raise ValueError('卖家已删除，挂牌暂不可成交')
            payload, remaining = split_escrow(listing.item, count)
            amount = listing.unit_price*count
            change_money(agent, -amount, key, at); change_money(seller, amount, key, at)
            result['item_id'] = deliver(owner, agent, payload, key).pk
            listing.item, listing.remaining_quantity = remaining, remaining['quantity']
            if not listing.remaining_quantity: listing.status = 'sold'
            result.update(name=payload['name'], quantity=count, stars=payload['source'].get('stars'), total=str(amount), unit_price=str(listing.unit_price), seller_id=seller.pk, seller_balance=str(seller.money))
            deltas.extend([{'actor_id':agent.pk,'amount':str(-amount)}, {'actor_id':seller.pk,'amount':str(amount)}])
        else:
            if listing.seller_id != agent.pk: raise ValueError('只能修改自己的挂牌')
            if kind == 'withdraw':
                result['item_id'] = deliver(owner, agent, listing.item, key).pk
                result.update(name=listing.item['name'], quantity=listing.remaining_quantity)
                listing.remaining_quantity, listing.status = 0, 'withdrawn'
                listing.item = {**listing.item, 'quantity':0, 'source':{**listing.item.get('source',{}), 'lots':[]}}
            else:
                old_price = str(listing.unit_price)
                listing.unit_price = price(operation.get('unit_price')); listing.repriced_at = at
                listing.history = [*listing.history, {'from':old_price,'to':str(listing.unit_price),'at':at.isoformat(),'transaction_id':key}]
        listing.version += 1
        listing.operation_keys = [*listing.operation_keys, key]
        listing.save()
        result.update(listing_id=listing.pk, version=listing.version, unit_price=str(listing.unit_price))
    else: raise ValueError('未知市场操作')
    result['deltas'] = deltas
    result['balance'] = str(agent.money)
    MarketTransaction.objects.create(pk=key, owner_id=owner, session=session, actor_id=agent.pk, actor_name=agent.name,
                                    operation=operation, result=result, created_at=at)
    from .combat.market import record
    record(agent,key,operation,result)
    return result
