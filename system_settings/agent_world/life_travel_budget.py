"""长流程扣费前复核预留；预算调整不创造资金或重复扣款。"""
from decimal import Decimal

from .life_budget_policy import allows_spending, remaining_reservation
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_budget import adjust_budget, money
from .life_scope import check_item_authorization


def review_travel_budget(journey, amount):
    from .travel_shopping import life_item_for_journey
    item = life_item_for_journey(journey)
    if not item:
        return  # 旧手动旅行兼容。
    check_item_authorization(item)
    agent = journey.agent
    agent.refresh_from_db()
    others = LifeItem.objects.filter(owner_id=item.owner_id, actor_id=item.actor_id, status__in=OPEN).exclude(pk=item.pk)
    reserved = sum((remaining_reservation(r) for r in others), Decimal(0))
    if amount <= item.budget-item.spent and agent.money-amount >= reserved:
        return
    from .travel_ai import ask, text

    def validate(value):
        if not isinstance(value.get('allocations'), list):
            raise ValueError('须说明调整原因并提供预算分配')
        for entry in value['allocations']:
            if not isinstance(entry, dict) or not isinstance(entry.get('id'), str):
                raise ValueError('预算分配无效')
            money(entry.get('budget'))
        return {'allocations': value['allocations'], 'reason': text(value, 'reason', 1000)}

    others = list(LifeItem.objects.filter(owner_id=item.owner_id, actor_id=item.actor_id, status__in=OPEN)
                  .exclude(pk=item.pk).order_by('scheduled_at'))
    reserved = sum((remaining_reservation(row) for row in others), Decimal(0))
    life_projection = {
        'balance': str(agent.money),
        'current': {'id': item.pk, 'activity': item.activity, 'budget': str(item.budget),
                    'spent': str(item.spent), 'remaining': str(remaining_reservation(item))},
        'reserved_for_others': str(reserved),
        'other_commitments': [
            {'id': row.pk, 'activity': row.activity, 'budget': str(row.budget),
             'spent': str(row.spent), 'remaining': str(remaining_reservation(row))}
            for row in others if allows_spending(row.activity)
        ],
    }
    decision = ask(journey, '实际费用超出当前预留，请根据后续安排重新分配预算，可缩减后续可选购物。'
                   '返回 {"allocations":[{"id":"安排ID","budget":"总预算"}],"reason":"实际费用及调整原因"}。'
                   '预算不能小于已支出，不能突破真实余额。',
                   {'required_payment': str(amount), 'life': life_projection}, validate)
    adjust_budget(item.owner_id, item.actor_id, decision['allocations'], decision['reason'])
