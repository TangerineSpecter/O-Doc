"""Commit one complete slot before selecting the next slot for this resident."""
from decimal import Decimal
from django.db.models import Min
from .life_models import LifeItem
from .life_schedule import OPEN
from .life_time import local_time
from .life_budget_choices import BudgetChoices
from .life_budget_policy import remaining_reservation
from .life_context import build_planning_selection_context
from .life_eligibility import filter_activities, local_time_from_slot
from .cooking_schedule_plan import planning_facts, decide_plan
from .life_choices import choose
from .life_config import task_for, tasks_for


def prepare_targets(config, agent, items: list, preserve: bool) -> list:
    """Release replaced intentions together, retaining today's committed slots."""
    from django.db import transaction
    from .farm_gate import farm_gate
    from .life_schedule import requeue, revise
    result = []
    with farm_gate(), transaction.atomic():
        for source in sorted(items, key=lambda item: (item.scheduled_at, item.pk)):
            item = LifeItem.objects.select_for_update().get(pk=source.pk)
            if item.owner_id != config.pk or item.actor_id != agent.pk:
                raise ValueError('规划时段不属于当前居民')
            if item.status not in OPEN or item.status == 'running':
                continue
            if not preserve and item.activity not in ('unplanned', ''):
                day = local_time(item.scheduled_at).date().isoformat()
                if item.context.get('planned_on') == day:
                    continue
                if item.context.get('farm_plan_id') or item.context.get('lottery_plan') or item.record_id or item.context.get('execution_started'):
                    revise(item, '保留已固化领域计划，更新当日复核标记',
                           context={**item.context, 'planned_on': day})
                    continue
                requeue(item, '重新规划前释放原预算与材料预留')
            result.append(item)
    return result


def plan_slots(config, agent, items: list, *, apply, ask, ask_detail,
               preserve_activities: bool = False) -> list[dict]:
    from .life_plan_proposal import selection_context
    from .travel_models import TravelDestination
    ordered = prepare_targets(config, agent, items, preserve_activities)
    agent.refresh_from_db()
    excluded = [item.pk for item in ordered]
    others = LifeItem.objects.filter(owner_id=config.pk, actor_id=agent.pk, status__in=OPEN).exclude(pk__in=excluded)
    budget = BudgetChoices(agent.money, sum((remaining_reservation(item) for item in others), Decimal(0)))
    minimum = TravelDestination.objects.filter(enabled=True).aggregate(value=Min('price'))['value']
    farm_days = {local_time(at).date().isoformat() for at in others.filter(activity='farm').values_list('scheduled_at', flat=True)}
    tasks = tasks_for(config.pk)
    selected = []
    for item in ordered:
        item.refresh_from_db()
        if item.status not in OPEN or item.status == 'running':
            continue
        if (not preserve_activities and item.activity not in ('unplanned', '')
                and item.context.get('planned_on') == local_time().date().isoformat()):
            # A retry of a partially completed pass must not redraw earlier slots.
            continue
        context = build_planning_selection_context(config.pk, agent, [item])
        if preserve_activities and item.activity == 'travel' and item.context.get('travel_plan'):
            from .life_daily_travel import recheck
            from .farm_queue_decision import available_cash
            recheck(item.context['travel_plan'], min(item.budget - item.spent,
                available_cash(config.pk, agent.pk, exclude_ids=[item.pk])))
            selected.append({'id': item.pk, 'activity': 'travel', 'budget': str(item.budget)})
            continue
        slot = context['slots'][0]
        agent.refresh_from_db()
        budget.reserved = sum((remaining_reservation(row) for row in others.all()), Decimal(0))
        actual_others = LifeItem.objects.filter(owner_id=config.pk, actor_id=agent.pk,
                                               status__in=OPEN).exclude(pk=item.pk)
        cash_left = agent.money - sum((remaining_reservation(row) for row in actual_others), Decimal(0))
        tiers = {kind: budget.options(kind, minimum=minimum or Decimal(0) if kind == 'travel' else Decimal(0),
                                     spent=item.spent, cash_left=cash_left)
                 for kind in ('travel', 'investment')}
        if minimum is None:
            tiers['travel'] = {}
        cooking = planning_facts(config.pk, agent, exclude_ids=[item.pk]) if any(
            row['kind'] == 'cooking' for row in context['activities']) else None
        from .alchemy_schedule_plan import planning_facts as alchemy_facts
        alchemy = alchemy_facts(config.pk, agent, exclude_ids=[item.pk]) if any(
            row['kind'] == 'alchemy' for row in context['activities']) else None
        choices, reasons = filter_activities(context, slot, tiers, cooking, farm_days, alchemy)
        state = selection_context(context)
        state['activities'] = [row for row in state['activities'] if row['kind'] in choices]
        state['selected'] = selected
        if preserve_activities:
            activity = item.activity
            if activity != 'rest' and activity not in choices:
                raise ValueError(reasons.get(activity, '原活动当前不可执行'))
        else:
            activity = choose(agent, config.pk, 'life_activity', state, choices) if choices else 'rest'
        reason = (item.intent if preserve_activities else '') or (
            '没有可执行活动，代码安排休息：' + ('；'.join(reasons.values()) or '活动均未配置或已停用') if activity == 'rest'
            else f'系统选择说明：为该时段选择{activity}，这是计划，尚未执行。')
        plan = {'id': item.pk, 'activity': activity, 'reason': reason,
                'budget': str(item.spent), 'needs_market': False}
        option = None
        if activity in tiers:
            options = tiers[activity]
            identity = choose(agent, config.pk, 'life_budget',
                              {'activity': activity, 'slot': slot, 'base_cash': str(budget.base),
                               'cash_available': str(cash_left), 'goals': context.get('goals', []),
                               'selected': selected}, options)
            option = options[identity]
            plan['budget'] = option['budget']
            plan['budget_reason'] = f"{option['label']} {option['percent']}%，按总资金 {budget.base} 计算，新增预留 {option['amount']}"
        elif activity == 'cooking':
            cooking_activity = next(row for row in context['activities'] if row['kind'] == 'cooking')
            plan['cooking_plan'] = decide_plan(
                agent, config.pk, {**cooking, 'task_preference': cooking_activity['preference']}, key=item.pk,
                task=task_for(config.pk, agent, 'cooking', tasks=tasks))
        elif activity == 'alchemy':
            from .alchemy_schedule_plan import decide_plan as alchemy_plan
            alchemy_activity = next(row for row in context['activities'] if row['kind'] == 'alchemy')
            plan['alchemy_plan'] = alchemy_plan(agent, config.pk, {**alchemy, 'task_preference': alchemy_activity['preference']},
                                                task=task_for(config.pk, agent, 'alchemy', tasks=tasks))
        elif activity == 'farm':
            from .farm_queue_decision import decide_plan as decide_farm_queue
            plan['farm_plan'] = decide_farm_queue(agent, config.pk, slot, reason,
                                                 context.get('preferences', ''),
                                                 task=task_for(config.pk, agent, 'farm', tasks=tasks))
            plan['_farm_queue_candidate'] = True
        proposal = {'plans': [plan], '_automatic_rest': activity == 'rest',
                    '_expected_versions': {item.pk: item.updated_at.isoformat()}}
        apply(config.pk, agent, [item], proposal, skip_unchanged=preserve_activities)
        if option:
            budget.accept(option)
        if activity == 'farm':
            farm_days.add(local_time_from_slot(slot).date().isoformat())
        selected.append({'id': item.pk, 'activity': activity, 'budget': plan['budget']})
    return selected
