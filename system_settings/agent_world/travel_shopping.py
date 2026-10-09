"""旅行购物的实时资金范围和正常价值范围内的商品候选。"""
import random
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR
from system_settings.models import Agent
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_budget_policy import remaining_reservation
from .inventory_attributes import souvenir_attributes


def available_funds(journey, *, route_cost: Decimal = Decimal(0)) -> dict:
    agent = Agent.objects.get(pk=journey.actor_id)
    item = LifeItem.objects.filter(pk=journey.pk, actor_id=journey.actor_id, owner_id=journey.owner_id).first()
    available = agent.money
    result = {'balance': str(agent.money)}
    if item:
        others = LifeItem.objects.filter(owner_id=item.owner_id, actor_id=item.actor_id, status__in=OPEN).exclude(pk=item.pk)
        reserved = sum((remaining_reservation(row) for row in others), Decimal(0))
        available = max(Decimal(0), min(remaining_reservation(item), agent.money-reserved))
        result.update(life_budget=str(item.budget), life_spent=str(item.spent), reserved_for_others=str(reserved))
    result['available'] = str(max(Decimal(0), available-route_cost))
    return result


def shopping_limits(journey, *, route_cost: Decimal = Decimal(0)) -> dict:
    result = available_funds(journey, route_cost=route_cost)
    budget = Decimal(journey.snapshot['selection']['shopping_budget'])
    result.update(shopping_budget=str(budget), spendable=str(min(budget, Decimal(result['available']))))
    return result


def price_range(route_price: Decimal) -> tuple[int, int]:
    lower = max(1, int((route_price*Decimal('.01')/10).to_integral_value(rounding=ROUND_CEILING)))
    upper = max(lower, int((route_price*Decimal('.1')/10).to_integral_value(rounding=ROUND_FLOOR)))
    return lower, upper


def generate_goods(souvenirs: list[dict], route_price: Decimal, spendable: Decimal) -> list[dict]:
    lower, upper = price_range(route_price)
    affordable_upper = min(upper, int((spendable/10).to_integral_value(rounding=ROUND_FLOOR)))
    # 生成多数可承担候选，留一个完整价域选项；不把既有贵重商品降价或突破正常下限。
    affordable_count = len(souvenirs)-1 if affordable_upper >= lower else 0
    goods = []
    for index, item in enumerate(souvenirs):
        ceiling = affordable_upper if index < affordable_count else upper
        price = str(random.randint(lower, ceiling)*10)
        goods.append({**item, 'id': str(index+1), 'price': price, **souvenir_attributes(price)})
    return goods
