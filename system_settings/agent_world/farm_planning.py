"""农场决策的生活额度快照与整份计划校验；不产生扣款或预算变更。"""
from decimal import Decimal

from .life_budget import future_allocations
from .life_budget_policy import remaining_reservation
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_scope import CURRENT


def spending_context(agent) -> dict:
    scope = CURRENT.get()
    if not scope or scope['actor_id'] != agent.pk:
        return {'spendable': str(agent.money)}
    rows = list(LifeItem.objects.filter(owner_id=scope['owner_id'], actor_id=agent.pk, status__in=OPEN))
    item = next((row for row in rows if row.pk == scope['item_id']), None)
    if item is None:
        raise ValueError('生活预算安排不存在或已结束')
    reserved = sum((remaining_reservation(row) for row in rows if row.pk != item.pk), Decimal(0))
    return {'item_id': item.pk, 'budget': str(item.budget), 'spent': str(item.spent),
            'reserved_for_others': str(reserved),
            'spendable': str(max(Decimal(0), min(item.budget - item.spent, agent.money - reserved)))}


def validate_plan_budget(agent, options: list[dict], decision: dict) -> None:
    cost = sum((Decimal(option['cost']) for option in options if option['id'] in decision['choices']), Decimal(0))
    context = spending_context(agent)
    available = Decimal(context['spendable'])
    allocations = decision.get('budget_allocations')
    if allocations:
        scope = CURRENT.get()
        if not scope or scope['actor_id'] != agent.pk:
            raise ValueError('没有当前生活安排，不能调整生活预算')
        rows = list(LifeItem.objects.filter(owner_id=scope['owner_id'], actor_id=agent.pk, status__in=OPEN))
        changes = future_allocations(rows, allocations, decision.get('budget_reason'))
        reserved = sum((remaining_reservation(row, changes.get(row.pk)) for row in rows), Decimal(0))
        if reserved > agent.money:
            raise ValueError('预留总额超出真实余额')
        item = next(row for row in rows if row.pk == scope['item_id'])
        others = sum((remaining_reservation(row, changes.get(row.pk)) for row in rows if row.pk != item.pk), Decimal(0))
        available = max(Decimal(0), min(changes.get(item.pk, item.budget) - item.spent, agent.money - others))
    if cost > available:
        raise ValueError(f'所选操作合计需要 {cost} 世界币，本次可用预算为 {available}；请合理调整预算或只选择可负担及免费操作')
