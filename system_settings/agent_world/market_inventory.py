"""挂牌托管精确物品与价格批次，转移不改变来源身份或图片。"""
import copy
import uuid
from decimal import Decimal
from .travel_models import AgentInventoryItem

FIELDS = ('name', 'kind', 'value', 'rarity', 'origin_actor_id', 'origin_actor_name', 'source', 'icon_asset_id', 'created_at')


def split_item(item: AgentInventoryItem, quantity: int) -> dict:
    if type(quantity) is not int or quantity < 1 or quantity > item.quantity:
        raise ValueError('库存不足或数量无效')
    payload = {key: copy.deepcopy(getattr(item, key)) for key in FIELDS}
    payload['value'] = str(payload['value'])
    payload['created_at'] = payload['created_at'].isoformat()
    payload['quantity'] = quantity
    source = dict(item.source)
    if source.get('lots'):
        used, kept, needed = [], [], quantity
        if sum(lot['quantity'] for lot in source['lots']) != item.quantity:
            raise ValueError('库存价格批次不一致')
        for lot in source['lots']:
            take = min(needed, lot['quantity']); needed -= take
            if take:
                used.append({**lot, 'quantity': take})
            if lot['quantity'] > take:
                kept.append({**lot, 'quantity': lot['quantity']-take})
        payload['source'] = {**source, 'lots': used}
        item.source = {**source, 'lots': kept}
        if kept:
            item.value = Decimal(kept[0]['price'])
    item.quantity -= quantity
    if item.quantity:
        item.save(update_fields=['quantity', 'source', 'value'])
    else:
        item.delete()
    return payload


def split_escrow(payload: dict, quantity: int) -> tuple[dict, dict]:
    """Split JSON escrow with the same FIFO rules without creating temporary inventory."""
    if quantity < 1 or quantity > payload['quantity']:
        raise ValueError('挂牌库存不足')
    taken, remaining = copy.deepcopy(payload), copy.deepcopy(payload)
    taken['quantity'], remaining['quantity'] = quantity, payload['quantity']-quantity
    lots = payload.get('source', {}).get('lots')
    if lots:
        if sum(lot['quantity'] for lot in lots) != payload['quantity']:
            raise ValueError('托管价格批次不一致')
        used, kept, needed = [], [], quantity
        for lot in lots:
            take = min(needed, lot['quantity']); needed -= take
            if take: used.append({**lot, 'quantity': take})
            if lot['quantity'] > take: kept.append({**lot, 'quantity': lot['quantity']-take})
        taken['source']['lots'], remaining['source']['lots'] = used, kept
        taken['value'] = used[0]['price']
        if kept: remaining['value'] = kept[0]['price']
    return taken, remaining


def deliver(owner: str, agent, payload: dict, trade_id: str) -> AgentInventoryItem:
    values = {key: copy.deepcopy(payload[key]) for key in FIELDS}
    values['source'] = {**values['source'], 'market_trade_id': trade_id}
    return AgentInventoryItem.objects.create(pk=uuid.uuid4().hex, owner_id=owner, actor_id=agent.pk,
                                            actor_name=agent.name, quantity=payload['quantity'], **values)
