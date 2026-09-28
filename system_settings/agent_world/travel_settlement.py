from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from system_settings.models import Agent, WorldAction
from .models import WorldLedger
from .income import ensure_opening
from .execution import stamina
from .travel_models import TravelJourney, AgentInventoryItem


def _charge(agent, key, amount, kind, snapshot):
    if WorldLedger.objects.filter(pk=key).exists():
        return
    ensure_opening(agent)
    balance = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(value=Sum('amount'))['value'] or Decimal('0')
    if amount < 0 or balance < amount:
        raise ValueError('当前余额不足，未扣款')
    WorldLedger.objects.create(pk=key, agent_id=agent.pk, agent_name=agent.name,
                              kind=kind, amount=-amount, snapshot=snapshot)
    agent.money = balance-amount
    agent.save(update_fields=['money'])


@transaction.atomic
def depart(journey):
    row = TravelJourney.objects.select_for_update().get(pk=journey.pk)
    if row.departed_at:
        return row
    if row.status != 'active':
        raise ValueError('旅行已暂停或结束')
    agent = Agent.objects.select_for_update().get(pk=row.actor_id)
    energy = Decimal(str(row.snapshot['config']['energy_cost']))
    if stamina(agent) < energy:
        raise ValueError('出发体力不足')
    _charge(agent, f'travel:{row.pk}:depart', Decimal(row.snapshot['selected']['price']), 'travel', {'journey_id': row.pk})
    now = timezone.now()
    action, _ = WorldAction.objects.get_or_create(pk=row.pk, defaults={'task_id': row.task_id, 'agent': agent, 'actor_id': agent.pk})
    action.status, action.energy_cost, action.consumed_at, action.effects_done = 'success', energy, now, True
    action.result = {'journey_id': row.pk, 'kind': 'travel_departure'}
    action.save(update_fields=['status', 'energy_cost', 'consumed_at', 'effects_done', 'result', 'updated_at'])
    row.departed_at = row.arrived_at = now
    row.save(update_fields=['departed_at', 'arrived_at', 'updated_at'])
    return row


@transaction.atomic
def purchase(journey, basket):
    row = TravelJourney.objects.select_for_update().get(pk=journey.pk)
    key = f'travel:{row.pk}:shopping'
    if WorldLedger.objects.filter(pk=key).exists():
        return
    if row.status != 'active' or not row.departed_at or row.returned_at:
        raise ValueError('当前旅行不能购物')
    goods = {item['id']: item for item in row.snapshot['goods']}
    seen, amount, items = set(), Decimal('0'), []
    if not isinstance(basket, list) or len(basket) > len(goods):
        raise ValueError('购物篮无效')
    for choice in basket:
        key_id, count = choice.get('id'), choice.get('quantity')
        if key_id not in goods or key_id in seen or type(count) is not int or not 1 <= count <= 3:
            raise ValueError('商品或数量越界')
        seen.add(key_id)
        item = goods[key_id]
        amount += Decimal(item['price'])*count
        items.append(AgentInventoryItem(id=f'{row.pk}:{key_id}', actor_id=row.actor_id, owner_id=row.owner_id, name=item['name'], quantity=count,
            source={'journey_id': row.pk, 'destination': row.snapshot['selected'], 'unit_price': item['price'], 'description': item['description']}))
    if amount > Decimal(row.snapshot['selection']['shopping_budget']):
        raise ValueError('超过本次购物预算')
    agent = Agent.objects.select_for_update().get(pk=row.actor_id)
    _charge(agent, key, amount, 'souvenir', {'journey_id': row.pk, 'basket': basket})
    # 使用 save 记录同步修订；购物事务整体失败时不会留下半份物品。
    for item in items:
        item.save(force_insert=True)
