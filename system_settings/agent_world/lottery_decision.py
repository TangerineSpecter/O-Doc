"""小候选决策；失败只能暂缓，绝不调用普通文本模型。"""
import copy
import time
from datetime import timedelta
from django.db import transaction
from system_settings.decision.routing import choose_scene, jev_enabled
from .farm_gate import farm_gate, guarded
from .farm_queue_decision import available_cash
from .life_models import LifeItem
from .life_schedule import revise
from .life_time import local_time
from .lottery_models import LotteryRound
from .lottery_rules import numbers, price
from .lottery_service import current_round, check_open, maximum, pool, reserved_tickets, validate_plan


class LotteryDecisionUnavailable(ValueError):
    pass


def enabled(owner):
    from system_settings.decision.failover import attempt_plan
    return all(jev_enabled(owner, scene) for scene in ('lottery_quantity', 'lottery_number')) and bool(attempt_plan(owner)[0])


def eligibility(owner, agent, at, item_id='') -> str:
    if not enabled(owner):
        return '请先启用大乐透数量和选号的决策连接'
    row = current_round(owner)
    try:
        check_open(owner, row, at)
        check_open(owner, row)
    except ValueError as exc:
        return str(exc)
    cash = available_cash(owner, agent.pk, exclude_ids=[item_id] if item_id else [])
    if maximum(owner, agent.pk, row, cash, item_id) < 1:
        return '本期购票额度已满或没有可用购票资金'
    return ''


def summary(owner, actor):
    row = current_round(owner)
    if row is None:
        return None
    return {'pool': str(pool(row)), 'held': row.tickets.filter(actor_id=actor).count(),
            'pending': reserved_tickets(owner, actor, row.pk), 'limit': 10,
            'price': str(price(row.rules)), 'draws_at': local_time(row.draws_at).isoformat()}


def state(item, agent, row, selected=None):
    return {'personality': (agent.role_profile or {}).get('personality', ''),
            'instructions': agent.prompt or '', 'held_numbers': list(row.tickets.filter(actor_id=agent.pk).values_list('numbers', flat=True)),
            'selected_numbers': selected or [], 'draws_at': local_time(row.draws_at).isoformat(),
            'pool': str(pool(row)), 'price': str(price(row.rules)), 'budget': str(item.budget)}


def choose(item, agent, scene, context, candidates):
    if not enabled(item.owner_id):
        raise LotteryDecisionUnavailable('大乐透决策连接尚未启用，不调用普通模型')
    from .life_scope import check_item_authorization
    check_item_authorization(item)
    value = choose_scene(item.owner_id, agent, scene, context, candidates,
        deadline=time.monotonic() + 60, include_role=False,
        instructions='结合人物性格和已有号码，从本题合法选项中选择一个；不预测中奖号码。')
    if value not in candidates:
        raise LotteryDecisionUnavailable('大乐透决策连接暂不可用或选择无效，不调用普通模型')
    check_item_authorization(LifeItem.objects.get(pk=item.pk))
    return candidates[value]


def prepare(item, agent):
    if existing := item.context.get('lottery_plan'):
        return copy.deepcopy(validate_plan(existing))
    target = (item.context.get('lottery_target') or
              item.context.get('daily_choice', {}).get('plan', {}).get('lottery_round_id'))
    row = LotteryRound.objects.filter(pk=target).first() if target else current_round(item.owner_id)
    check_open(item.owner_id, row, item.scheduled_at)
    check_open(item.owner_id, row)
    with farm_gate(), transaction.atomic():
        locked = LifeItem.objects.select_for_update().get(pk=item.pk)
        if target and target != row.pk:
            raise ValueError('购票目标期次已变化')
        locked.context = {**locked.context, 'lottery_target': row.pk}
        locked.save(update_fields=['context', 'updated_at'])
    item.refresh_from_db()
    cash = available_cash(item.owner_id, agent.pk, exclude_ids=[item.pk])
    maximum_count = maximum(item.owner_id, agent.pk, row, cash, item.pk)
    if maximum_count < 1:
        raise ValueError('已无可用购票资金或张数额度')
    context = {**state(item, agent, row), 'budget': str(cash), 'maximum_quantity': maximum_count}
    version = item.updated_at
    count = choose(item, agent, 'lottery_quantity', context, {str(i): i for i in range(1, maximum_count + 1)})
    latest = LifeItem.objects.get(pk=item.pk)
    if latest.updated_at != version or latest.context.get('lottery_target') != row.pk:
        raise ValueError('数量决策期间日程已变化，请重新规划')
    return {'round_id': row.pk, 'quantity': count}


def pick_numbers(item, agent):
    plan = validate_plan(item.context.get('lottery_plan'))
    row = LotteryRound.objects.get(pk=plan['round_id'])
    while True:
        item.refresh_from_db()
        picks = copy.deepcopy(item.context.get('lottery_numbers', []))
        if len(picks) == plan['quantity'] and len(picks[-1]) == 3:
            return [numbers(value) for value in picks]
        if not picks or len(picks[-1]) == 3:
            picks.append([])
        check_open(item.owner_id, row)
        partial = picks[-1]
        digit = choose(item, agent, 'lottery_number', state(item, agent, row, picks),
                       {str(n): n for n in range(1, 11) if n not in partial})
        picks[-1].append(digit)
        with farm_gate(), transaction.atomic():
            locked = LifeItem.objects.select_for_update().get(pk=item.pk)
            from .life_scope import check_item_authorization
            check_item_authorization(locked)
            if locked.context.get('lottery_plan') != plan:
                raise ValueError('选号过程中购票计划已变化')
            locked.context = {**locked.context, 'lottery_numbers': picks}
            locked.save(update_fields=['context', 'updated_at'])


@guarded
@transaction.atomic
def defer(item, exc):
    expected_target = item.context.get('lottery_target') or item.context.get('lottery_plan', {}).get('round_id')
    item.refresh_from_db()
    target = item.context.get('lottery_target') or item.context.get('lottery_plan', {}).get('round_id')
    if item.status not in ('pending', 'deferred') or target != expected_target:
        return
    now = local_time()
    attempts = item.context.get('lottery_attempts', 0) + 1
    point = now + timedelta(minutes=5 if attempts == 1 else 15)
    target = item.context.get('lottery_plan', {}).get('round_id') or item.context.get('lottery_target')
    row = LotteryRound.objects.filter(pk=target).first()
    terminal = attempts >= 3 or row is None or point >= local_time(row.closes_at)
    context = {**item.context, 'lottery_attempts': attempts, 'planning_retry_at': point.isoformat()}
    revise(item, str(exc), status='failed' if terminal else 'deferred', context=context,
           result={'reason': str(exc)})
