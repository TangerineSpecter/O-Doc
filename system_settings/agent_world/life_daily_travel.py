"""Travel quotes for daily planning; no text-model budget fallback or purchases."""
import time
from decimal import Decimal, ROUND_CEILING

from django.utils import timezone

from .life_budget import money
from .travel_models import TravelDestination


def covering_tier(price: Decimal) -> Decimal:
    if price <= 500:
        return Decimal(500)
    return Decimal(500) + ((price - 500) / 1000).to_integral_value(rounding=ROUND_CEILING) * 1000


def budget_options(maximum: Decimal, available: Decimal) -> dict:
    ceiling = covering_tier(maximum)
    amounts = {min(Decimal(500) + index * 1000, available)
               for index in range(int((ceiling - 500) / 1000) + 1)}
    return {'skip': {'label': '不去', 'budget': '0'}, **{
        f'cap_{amount}': {'label': f'旅行预算上限 {amount} 世界币', 'budget': str(amount)}
        for amount in sorted(amounts) if amount > 0}}


def prepare(owner: str, agent, available: Decimal, preferences: str) -> dict:
    from system_settings.decision.routing import choose_scene
    from .travel_candidates import candidates, travelling_ids
    from .life_config import tasks_for
    if agent.pk in travelling_ids():
        return {'candidates': []}
    maximum = TravelDestination.objects.filter(enabled=True, price__lte=available).order_by('-price').values_list('price', flat=True).first()
    if maximum is None:
        return {'candidates': []}
    choices = budget_options(maximum, available)
    minimum = TravelDestination.objects.filter(enabled=True).order_by('price').values_list('price', flat=True).first()
    choices = {key: value for key, value in choices.items()
               if key == 'skip' or money(value['budget']) >= minimum}
    selected = choose_scene(owner, agent, 'life_budget',
                            {'activity': 'travel', 'balance': str(agent.money),
                             'budget_ceiling': str(available), 'preferences': preferences}, choices,
                            deadline=time.monotonic() + 180)
    if selected == 'skip':
        return {'candidates': []}
    if selected is not None and selected not in choices:
        selected = None
    cap = money(choices[selected]['budget']) if selected else available
    task = next((task for task in tasks_for(owner)
                 if task.enabled and task.task_kind == 'travel'), None)
    return {'candidates': candidates(agent, (task.travel_config or {}).get('recent_cities', 3) if task else 3, budget=cap, limit=3),
            'budget': str(cap) if selected else None,
            'available': str(available), 'quoted_at': timezone.now().isoformat()}


def selected_plan(quotes: dict, destination_id: str) -> dict:
    destination = next((row for row in quotes.get('candidates', []) if row['id'] == destination_id), None)
    if destination is None:
        raise ValueError('旅行目的地必须属于本次报价')
    budget = money(quotes['budget']) if quotes.get('budget') else min(
        covering_tier(money(destination['price'])), money(quotes['available']))
    return {'destination': destination, 'budget': str(budget),
            'budget_source': 'structured' if quotes.get('budget') else 'price_tier',
            'quoted_at': quotes['quoted_at']}


def validate_snapshot(plan: dict) -> None:
    from datetime import datetime
    if not isinstance(plan, dict) or not isinstance(plan.get('destination'), dict):
        raise ValueError('旅行日程缺少目的地报价')
    destination = plan['destination']
    if not isinstance(destination.get('id'), str) or not destination['id']:
        raise ValueError('旅行目的地ID无效')
    if (any(not isinstance(destination.get(key), str) or not destination[key] for key in ('country_code', 'country', 'city'))
            or not isinstance(destination.get('region', ''), str)
            or plan.get('budget_source') not in ('structured', 'price_tier')
            or not isinstance(plan.get('quoted_at'), str)):
        raise ValueError('旅行目的地报价依据无效')
    datetime.fromisoformat(plan['quoted_at'])
    if money(plan.get('budget')) < money(destination.get('price')):
        raise ValueError('旅行预算不足以覆盖报价')


def recheck(plan: dict, available: Decimal) -> dict:
    validate_snapshot(plan)
    destination = plan['destination']
    current = TravelDestination.objects.filter(pk=destination['id'], enabled=True).first()
    if (not current or current.price != money(destination['price'])
            or current.price > min(available, money(plan['budget']))):
        raise ValueError('已选旅行目的地或费用已失效，请重新规划日程')
    return destination
