"""短事务购票及开奖；模型调用不在资产锁内。"""
import logging
import secrets
from datetime import datetime, timedelta, time
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from system_settings.models import Agent, AgentTask, AgentRunRecord, WorldAction, WorldActionRuntime
from .farm_gate import guarded
from .income import ensure_opening
from .life_models import LifeItem
from .life_schedule import OPEN, execution_key, stable_id, revise
from .life_time import local_time, storage_time, SHANGHAI
from .lottery_models import LotteryConfig, LotteryRound, LotteryTicket
from .lottery_rules import PRICE, RULES, numbers, settlement
from .models import WorldLedger

logger = logging.getLogger(__name__)


def current_round(owner: str) -> LotteryRound | None:
    return LotteryRound.objects.filter(owner_id=owner, status='open').order_by('sequence').first()


def create_round(config: LotteryConfig, sequence: int, opens_at: datetime) -> LotteryRound:
    draws = local_time(config.first_draw_at) + timedelta(days=3 * (sequence - 1))
    row, _ = LotteryRound.objects.get_or_create(id=f'lottery:{config.pk}:{sequence}', defaults={
        'owner_id': config.pk, 'sequence': sequence, 'opens_at': storage_time(opens_at),
        'closes_at': storage_time(draws - timedelta(minutes=5)), 'draws_at': storage_time(draws),
        'rules': dict(RULES)})
    return row


@guarded
@transaction.atomic
def configure(owner: str, enabled: bool) -> LotteryConfig | None:
    if type(enabled) is not bool:
        raise ValueError('启用状态须为布尔值')
    if not enabled and not LotteryConfig.objects.filter(pk=owner).exists():
        return None
    now = local_time()
    first = datetime.combine(now.date() + timedelta(days=3), time(20), SHANGHAI)
    config, _ = LotteryConfig.objects.select_for_update().get_or_create(id=owner,
        defaults={'first_draw_at': storage_time(first), 'created_at': storage_time(now)})
    config.enabled = enabled
    config.save()
    ensure_task(config)
    if not LotteryRound.objects.filter(owner_id=owner).exists():
        create_round(config, 1, now)
    if not enabled:
        for item in LifeItem.objects.filter(owner_id=owner, status__in=OPEN):
            if item.activity != 'lottery' and not item.context.get('lottery_target'):
                continue
            revise(item, '大乐透已停用，释放购票预留', status='cancelled')
    return config



@guarded
@transaction.atomic
def ensure_task(config: LotteryConfig) -> None:
    """能力任务需要一个真实主居民；统一生活参与者后续变化时一并刷新。"""
    from .life_config import config_for, ensure_profiles
    life = config_for(config.pk)
    ids = life.settings.get('agent_ids', [])
    ensure_profiles(config.pk, ids)
    agents = Agent.objects.filter(pk__in=ids, archived_at__isnull=True).order_by('pk')
    agent = agents.first()
    if agent is None:
        return
    task, _ = AgentTask.objects.get_or_create(id=stable_id('lottery-task', config.pk)[:40], defaults={
        'name': '大乐透购票', 'task_kind': 'lottery', 'lottery_config': {'owner_id': config.pk},
        'agent': agent, 'agent_ids': list(agents.values_list('pk', flat=True)), 'enabled': config.enabled})
    next_ids = list(agents.values_list('pk', flat=True))
    if (task.agent_id, task.enabled, task.agent_ids) != (agent.pk, config.enabled, next_ids):
        task.agent, task.enabled, task.agent_ids = agent, config.enabled, next_ids
        task.save(update_fields=['agent', 'agent_ids', 'enabled', 'updated_at'])


def reserved_tickets(owner: str, actor: str, round_id: str, exclude_id='') -> int:
    rows = LifeItem.objects.filter(owner_id=owner, actor_id=actor, status__in=OPEN).exclude(pk=exclude_id)
    return sum(row.context.get('lottery_plan', {}).get('quantity', 0) for row in rows
               if row.context.get('lottery_plan', {}).get('round_id') == round_id)


def maximum(owner: str, actor: str, row, cash: Decimal, exclude_id='') -> int:
    bought = LotteryTicket.objects.filter(round=row, actor_id=actor).count()
    return max(0, min(10 - bought - reserved_tickets(owner, actor, row.pk, exclude_id), int(cash // PRICE)))


def carry_in(row: LotteryRound) -> Decimal:
    previous = LotteryRound.objects.filter(owner_id=row.owner_id, sequence=row.sequence - 1, status='settled').first()
    return Decimal(previous.result['carry_out']) if previous else Decimal(0)


def pool(row: LotteryRound) -> Decimal:
    return carry_in(row) + PRICE * row.tickets.count() + Decimal(RULES['subsidy'])


def check_open(owner: str, row: LotteryRound | None, at: datetime | None = None) -> None:
    at = local_time(at)
    if not LotteryConfig.objects.filter(pk=owner, enabled=True).exists():
        raise ValueError('大乐透尚未启用')
    if row is None or row.owner_id != owner or row.status != 'open' or not local_time(row.opens_at) <= at < local_time(row.closes_at):
        raise ValueError('目标期次尚未开售或已经停售')


def validate_plan(plan: object) -> dict:
    if (not isinstance(plan, dict) or not isinstance(plan.get('round_id'), str)
            or type(plan.get('quantity')) is not int or not 1 <= plan['quantity'] <= 10):
        raise ValueError('大乐透购票计划无效')
    return plan


@guarded
@transaction.atomic
def purchase(item_id: str, selected: list[list[int]]) -> list[LotteryTicket]:
    from .life_budget import charge_budget
    from .life_scope import check_item_authorization
    item = LifeItem.objects.select_for_update().get(pk=item_id)
    key = f'lottery:buy:{item.pk}'
    existing = list(LotteryTicket.objects.filter(purchase_key=key).order_by('ordinal'))
    if existing:
        return existing
    check_item_authorization(item)
    if item.activity != 'lottery':
        raise ValueError('日程不是购票活动')
    plan = validate_plan(item.context.get('lottery_plan'))
    row = LotteryRound.objects.select_for_update().get(pk=plan['round_id'])
    check_open(item.owner_id, row)
    agent = Agent.objects.select_for_update().get(pk=item.actor_id)
    if not isinstance(selected, list) or len(selected) != plan['quantity']:
        raise ValueError('选号尚未全部完成')
    selected = [numbers(value) for value in selected]
    amount = PRICE * len(selected)
    if maximum(item.owner_id, agent.pk, row, agent.money, item.pk) < len(selected):
        raise ValueError('本期十张限额或真实余额已变化')
    ensure_opening(agent)
    charge_budget(agent, amount, item_id=item.pk, business_key=key)
    now = storage_time(local_time())
    tickets = [LotteryTicket.objects.create(id=f'{key}:{i}', owner_id=item.owner_id, round=row,
        actor_id=agent.pk, actor_name=agent.name, life_item_id=item.pk, purchase_key=key,
        ordinal=i, numbers=value, created_at=now) for i, value in enumerate(selected)]
    WorldLedger.objects.create(id=key, agent_id=agent.pk, agent_name=agent.name, kind='lottery', amount=-amount,
        snapshot={'owner_id': item.owner_id, 'round_id': row.pk, 'sequence': row.sequence,
                  'lottery_kind': 'purchase', 'ticket_ids': [t.pk for t in tickets]}, created_at=now)
    agent.money = WorldLedger.objects.filter(agent_id=agent.pk).aggregate(total=Sum('amount'))['total']
    agent.save(update_fields=['money'])
    record = AgentRunRecord.objects.create(task_id=item.task_id or None, task_name='大乐透购票', agent=agent,
        agent_name=agent.name, status='success', summary=f'第{row.sequence}期购票{len(tickets)}张，支出{amount}金币',
        output='；'.join('、'.join(map(str, value)) for value in selected))
    WorldAction.objects.create(id=execution_key(item), task_id=item.task_id or None, agent=agent,
        actor_id=agent.pk, record=record, status='success', effects_done=True,
        snapshot={'owner_id': item.owner_id, 'lottery_round_id': row.pk}, result={'ticket_ids': [t.pk for t in tickets]})
    item.refresh_from_db()
    revise(item, '购票完成', status='completed', record_id=record.pk,
           result={'reason': record.summary, 'round_id': row.pk, 'ticket_ids': [t.pk for t in tickets]})
    return tickets


@guarded
@transaction.atomic
def draw(round_id: str) -> LotteryRound:
    row = LotteryRound.objects.select_for_update().get(pk=round_id)
    if row.status == 'settled':
        return row
    if local_time() < local_time(row.draws_at):
        raise ValueError('尚未到开奖时间')
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return row
    previous = LotteryRound.objects.filter(owner_id=row.owner_id, sequence=row.sequence - 1).first()
    if row.sequence > 1 and (not previous or previous.status != 'settled'):
        raise ValueError('上一期尚未结算')
    result = settlement(list(row.tickets.values('actor_id', 'actor_name', 'numbers')),
                        secrets.SystemRandom().sample(range(1, 11), 3), carry_in(row))
    now = storage_time(local_time())
    for award in result['awards']:
        actor = Agent.objects.select_for_update().filter(pk=award['actor_id']).first()
        if actor:
            ensure_opening(actor)
        key = f'lottery:award:{row.pk}:{award["actor_id"]}:{award["tier"]}'
        WorldLedger.objects.create(id=key, agent_id=award['actor_id'], agent_name=award['actor_name'],
            kind='lottery', amount=Decimal(award['amount']), created_at=now,
            snapshot={'owner_id': row.owner_id, 'round_id': row.pk, 'sequence': row.sequence,
                      'lottery_kind': 'award', **award})
        if actor:
            actor.money = WorldLedger.objects.filter(agent_id=actor.pk).aggregate(total=Sum('amount'))['total']
            actor.save(update_fields=['money'])
    row.status, row.result, row.settled_at = 'settled', result, now
    row.save(update_fields=['status', 'result', 'settled_at'])
    config = LotteryConfig.objects.get(pk=row.owner_id)
    create_round(config, row.sequence + 1, row.draws_at)
    return row


@guarded
def tick() -> None:
    if not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
        return
    # 已售彩票即使停用新购买仍有兑奖权；暂停世界执行才暂停开奖。
    due = LotteryRound.objects.filter(status='open', draws_at__lte=timezone.now()).order_by('draws_at')
    for key, owner in list(due.values_list('pk', 'owner_id')[:20]):
        try:
            draw(key)
        except Exception:
            # draw 的短事务已回滚；其他账号和停售预留清理仍须继续。
            logger.exception('大乐透开奖失败 owner=%s round=%s', owner, key)
    for item in LifeItem.objects.filter(status__in=OPEN):
        target = (item.context.get('lottery_plan', {}).get('round_id') or item.context.get('lottery_target')
                  or item.context.get('daily_choice', {}).get('plan', {}).get('lottery_round_id'))
        if target and not LotteryRound.objects.filter(pk=target, status='open', closes_at__gt=timezone.now()).exists():
            with transaction.atomic():
                revise(item, '目标期次已停售，释放购票预留', status='cancelled')
