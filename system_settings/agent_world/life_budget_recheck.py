"""Code-only execution preflight; unchanged budgets need no provider call."""
from decimal import Decimal
from django.db.models import Min
from .life_budget_policy import remaining_reservation
from .life_models import LifeItem
from .life_schedule import OPEN


def needs_replanning(owner: str, agent, item) -> bool:
    if item.activity == 'farm':
        return not bool(item.context.get('farm_plan_id'))
    agent.refresh_from_db()
    rows = LifeItem.objects.filter(owner_id=owner, actor_id=agent.pk, status__in=OPEN)
    if sum((remaining_reservation(row) for row in rows), Decimal(0)) > agent.money:
        return True
    if item.activity == 'travel':
        from .travel_models import TravelDestination
        minimum = TravelDestination.objects.filter(enabled=True).aggregate(value=Min('price'))['value']
        if minimum is None:
            raise ValueError('当前没有启用的旅行目的地')
        return remaining_reservation(item) < minimum
    return False
