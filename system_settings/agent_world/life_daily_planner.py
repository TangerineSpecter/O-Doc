"""Select a resident's whole day in one text request, then prepare domain plans."""
import copy
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db import transaction

from .farm_gate import farm_gate
from .farm_queue_decision import available_cash
from .life_config import task_for
from .life_daily_facts import build, task_reason
from .life_daily_travel import prepare, selected_plan, recheck
from .life_models import LifeItem
from .life_schedule import revise
from .life_sequential_planner import prepare_targets
from .life_time import local_time, storage_time

INSTRUCTION = (
    '请一起安排目标日期所有slots中的日程，结合性格、兴趣、目标、当前资源和实际成果，'
    '为每个时段选择allowed_activities中的一个活动并说明自己的规划理由。职业仅供参考，不要求职业固定搭配。'
    '规划理由会展示给用户，必须用中文自然表达；不要直接写英文活动kind或程序字段名，例如用“农场”“种子库存”，不要写farm或seed_quantity。'
    '不能新增时间点、任务或游戏能力；有可用活动时不能休息，候选为空或唯一候选farm已安排在当天另一时段时填rest。farm每天最多一次。'
    '旅行必须从travel.candidates选择destination_id；报价与预算是上限参考，不是已扣款。'
    '探索时长由准备阶段决定，执行程序负责顺延，不能因下一日程临近而排除探索。'
    '现在只安排活动意向，不生成种植、菜谱、路线、交易和正文细节；计划不能当成实际成果。'
    '只返回 {"plans":[{"id":"时段ID","activity":"活动kind","reason":"规划理由",'
    '"destination_id":"仅旅行必填的地点ID"}]}。'
)


def validate_checkpoint(value: dict, item_id: str) -> None:
    from datetime import datetime
    from .life_config import KINDS
    from .life_daily_travel import validate_snapshot
    if not isinstance(value, dict) or not isinstance(value.get('time'), str):
        raise ValueError('日程意向检查点格式无效')
    datetime.fromisoformat(value['time'])
    plan = value.get('plan')
    if (not isinstance(plan, dict) or plan.get('id') != item_id
            or plan.get('activity') not in (*KINDS, 'rest')
            or plan.get('activity') == 'market'
            or not isinstance(plan.get('reason'), str) or not 0 < len(plan['reason'].strip()) <= 2000):
        raise ValueError('日程意向活动或理由无效')
    if plan['activity'] == 'travel':
        validate_snapshot(plan.get('travel_plan'))
    if 'offered_activities' in plan and (not isinstance(plan['offered_activities'], list)
            or any(kind not in KINDS or kind == 'market' for kind in plan['offered_activities'])):
        raise ValueError('日程意向活动范围无效')


def saved_choice(item) -> dict | None:
    checkpoint = item.context.get('daily_choice')
    if (isinstance(checkpoint, dict) and isinstance(checkpoint.get('plan'), dict)
            and (checkpoint.get('time') == local_time(item.scheduled_at).isoformat()
                 or (checkpoint['plan'].get('activity') == 'lottery' and item.context.get('lottery_target')))):
        validate_checkpoint(checkpoint, item.pk)
        return copy.deepcopy(checkpoint['plan'])
    return None


def checkpoint(items: list, plans: list[dict], versions: dict) -> None:
    from system_settings.agent_availability import require_active_agent
    with farm_gate(), transaction.atomic():
        rows = {row.pk: row for row in LifeItem.objects.select_for_update().filter(pk__in=versions)}
        for source in items:
            row = rows.get(source.pk)
            if row is None:
                raise ValueError('日程已删除，请重新规划')
            require_active_agent(row.actor_id)
            if (row.status not in ('pending', 'deferred') or row.updated_at.isoformat() != versions[row.pk]
                    or row.scheduled_at != source.scheduled_at or row.actor_id != source.actor_id
                    or row.owner_id != source.owner_id):
                raise ValueError('日程在规划期间发生变化，请重新规划')
        for source, plan in zip(items, plans):
            row = rows[source.pk]
            revise(row, '已确认整日活动意向，继续准备领域方案', context={**row.context, 'daily_choice': {
                'time': local_time(row.scheduled_at).isoformat(), 'plan': plan}})
            source.refresh_from_db()


def select_day(config, agent, items: list, ask) -> None:
    missing = [item for item in items if saved_choice(item) is None]
    if not missing:
        return
    agent.refresh_from_db()
    cash = available_cash(config.pk, agent.pk, exclude_ids=[i.pk for i in missing])
    saved_travel = sum((Decimal(choice['travel_plan']['budget'])
                        for item in items if (choice := saved_choice(item)) and choice.get('travel_plan')), Decimal(0))
    from .life_config import tasks_for
    from .life_models import LifeProfile
    from .travel_config import bound_skill
    from .life_scope import allowed
    travel_enabled = any(task.enabled and task.task_kind == 'travel' and allowed(task, agent.pk) for task in tasks_for(config.pk))
    preferences = LifeProfile.objects.filter(pk=agent.pk, owner_id=config.pk).values_list('preferences', 'direction').first() or ('', '')
    quotes = prepare(config.pk, agent, max(Decimal(0), cash - saved_travel), '\n'.join(preferences)) if (
        travel_enabled and bound_skill(agent, 'odoc_travel_journal')) else {'candidates': []}
    context = build(config.pk, agent, missing, quotes)
    for candidate in quotes.get('candidates', []):
        candidate['required_budget'] = selected_plan(quotes, candidate['id'])['budget']
    if quotes.get('candidates') and 'travel' in context:
        context['travel']['candidates'] = quotes['candidates']
    context['daily_planning'] = True
    context['travel_budget_ceiling'] = str(max(Decimal(0), cash - saved_travel))
    versions = {item.pk: item.updated_at.isoformat() for item in missing}
    if any(slot['allowed_activities'] for slot in context['slots']):
        result = ask(agent, INSTRUCTION, context, include_profile=False, include_memory=False)
        from .life_output_validation import validate_life_output
        validate_life_output(result, INSTRUCTION, context)
        indexed = {row['id']: row for row in result['plans']}
    else:
        indexed = {item.pk: {'id': item.pk, 'activity': 'rest', 'reason': '系统检查后没有可执行活动'} for item in missing}
    plans = []
    for item in missing:
        choice = indexed[item.pk]
        plan = {key: choice[key] for key in ('id', 'activity', 'reason')}
        plan['offered_activities'] = next(slot['allowed_activities'] for slot in context['slots'] if slot['id'] == item.pk)
        if plan['activity'] == 'rest':
            plan['reason'] = '当天可执行活动已在其他时段安排，系统安排休息' if plan['offered_activities'] else '系统检查后没有可执行活动，安排休息'
        if plan['activity'] == 'lottery':
            from .lottery_service import current_round
            plan['lottery_round_id'] = current_round(config.pk).pk
        if plan['activity'] == 'travel':
            plan['travel_plan'] = selected_plan(quotes, choice['destination_id'])
        plans.append(plan)
    checkpoint(missing, plans, versions)


def prepare_detail(config, agent, item, choice: dict, budget_state) -> dict:
    from .life_config import tasks_for
    from .life_choices import choose
    from .cooking_schedule_plan import planning_facts, decide_plan, recipe_options
    activity = choice['activity']
    plan = {**choice, 'budget': str(item.spent), 'needs_market': False, '_daily_plan': True}
    if activity == 'rest':
        return plan
    task = next((task for task in tasks_for(config.pk) if task.enabled and task.task_kind == activity), None)
    if not task:
        raise ValueError('已选活动当前不可用，请重新规划')
    reason = task_reason(config.pk, agent, task, local_time(item.scheduled_at))
    if reason:
        raise ValueError(reason + '，请重新规划日程')
    cash = available_cash(config.pk, agent.pk, exclude_ids=[item.pk])
    if activity == 'lottery':
        from .lottery_decision import prepare
        from .lottery_rules import PRICE
        plan['lottery_plan'] = prepare(item, agent)
        plan['budget'] = str(PRICE * plan['lottery_plan']['quantity'])
    elif activity == 'travel':
        recheck(choice['travel_plan'], cash)
        plan['budget'] = str(item.spent + Decimal(choice['travel_plan']['budget']))
    elif activity == 'investment':
        if local_time(item.scheduled_at).weekday() >= 5:
            raise ValueError('该时段为周末，不能执行投资')
        agent.refresh_from_db()
        budget_state.reserved = max(Decimal(0), agent.money - cash - budget_state.selected_amount)
        options = budget_state.options('investment', spent=item.spent, cash_left=cash)
        if not options:
            if choice.get('offered_activities') == ['investment']:
                return {**plan, 'activity': 'rest', 'reason': '前序日程预留后已无可用投资预算，系统安排休息'}
            raise ValueError('当前资金不足以准备投资预算，请重新规划')
        identity = choose(agent, config.pk, 'life_budget',
                          {'activity': activity, 'balance': str(agent.money), 'cash_available': str(cash),
                           'intent': choice['reason']}, options)
        plan['budget'] = options[identity]['budget']
        plan['_budget_option'] = options[identity]
        plan['budget_reason'] = f"{options[identity]['label']} {options[identity]['percent']}%，按总资金 {budget_state.base} 计算"
    elif activity == 'cooking':
        facts = planning_facts(config.pk, agent, exclude_ids=[item.pk])
        if not recipe_options(facts['rules'], facts['level'], facts['pool'], facts['energy']):
            if choice.get('offered_activities') == ['cooking']:
                return {**plan, 'activity': 'rest', 'reason': '最新材料或体力已不足，当前无其他候选，系统安排休息'}
            raise ValueError('已选美食活动的材料或体力不足，请重新规划')
        plan['cooking_plan'] = decide_plan(agent, config.pk, {**facts, 'task_preference': task.prompt}, key=item.pk,
                                           task=task_for(config.pk, agent, 'cooking'))
    elif activity == 'alchemy':
        from .alchemy_schedule_plan import planning_facts as alchemy_facts, decide_plan as alchemy_plan
        from .life_eligibility import alchemy_options
        facts = alchemy_facts(config.pk, agent, exclude_ids=[item.pk])
        if not alchemy_options(facts):
            if choice.get('offered_activities') == ['alchemy']:
                return {**plan, 'activity': 'rest', 'reason': '最新素材或体力已不足，当前无其他候选，系统安排休息'}
            raise ValueError('已选炼金活动的素材或体力不足，请重新规划')
        plan['alchemy_plan'] = alchemy_plan(agent, config.pk, {**facts, 'task_preference': task.prompt},
                                            task=task_for(config.pk, agent, 'alchemy'))
    elif activity == 'farm':
        from .farm_queue_decision import decide_plan as farm_plan
        from .life_models import LifeProfile
        preferences = LifeProfile.objects.filter(pk=agent.pk, owner_id=config.pk).values_list('preferences', flat=True).first() or ''
        plan['farm_plan'] = farm_plan(agent, config.pk, {'id': item.pk, 'time': local_time(item.scheduled_at).isoformat()},
                                      choice['reason'], preferences, task=task_for(config.pk, agent, 'farm'))
        plan['_farm_queue_candidate'] = True
    return plan


def plan_days(config, agent, items: list, *, apply, ask, ask_detail) -> list[dict]:
    if any(item.owner_id != config.pk or item.actor_id != agent.pk or item.activity == 'market_prepare' for item in items):
        raise ValueError('规划时段不属于当前居民或属于独立市场机会')
    requested_days = {local_time(item.scheduled_at).date() for item in items}
    grouped = defaultdict(list)
    for day in sorted(requested_days):
        start = local_time().replace(year=day.year, month=day.month, day=day.day, hour=0, minute=0, second=0, microsecond=0)
        candidates = list(LifeItem.objects.filter(owner_id=config.pk, actor_id=agent.pk,
            status__in=('pending', 'deferred'), scheduled_at__gte=storage_time(start),
            scheduled_at__lt=storage_time(start + timedelta(days=1))).exclude(activity='market_prepare').order_by('scheduled_at', 'id'))
        prepared = prepare_targets(config, agent, candidates, False)
        for item in prepared:
            if item.context.get('farm_plan_id') or item.context.get('execution_started') or item.record_id:
                continue
            if item.activity not in ('unplanned', '') and item.context.get('planned_on') == day.isoformat():
                continue
            grouped[day].append(item)
    selected = []
    for daily in grouped.values():
        select_day(config, agent, daily, ask)
        from .life_budget_choices import BudgetChoices
        agent.refresh_from_db()
        budget_state = BudgetChoices(agent.money)
        # Reserve selected trips first so later investment budgets cannot spend their money.
        for item in sorted(daily, key=lambda row: (saved_choice(row)['activity'] != 'travel', row.scheduled_at, row.pk)):
            item.refresh_from_db()
            choice = saved_choice(item)
            if choice is None or item.status not in ('pending', 'deferred'):
                raise ValueError('日程已变化，请重新规划')
            version = item.updated_at.isoformat()
            from .lottery_decision import LotteryDecisionUnavailable, defer
            try:
                plan = prepare_detail(config, agent, item, choice, budget_state)
            except LotteryDecisionUnavailable as exc:
                defer(item, exc)
                continue
            if choice['activity'] == 'lottery':
                version = item.updated_at.isoformat()
            apply(config.pk, agent, [item], {'plans': [plan], '_automatic_rest': plan['activity'] == 'rest',
                                           '_expected_versions': {item.pk: version}})
            if option := plan.pop('_budget_option', None):
                budget_state.accept(option)
            selected.append(plan)
    return selected
