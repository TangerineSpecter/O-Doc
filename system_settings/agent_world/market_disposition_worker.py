"""逐题询问决策模型，把待标记 sku 补成长期处置策略。

问题拆开问：持有量、渠道、比例、星级顺序、挂牌价。禁止把数量与星级合并成
笛卡尔候选；每个答案写入任务缓存，重启或限流后不重掷。
"""
import time
from datetime import timedelta

from django.utils import timezone

from system_settings.decision.routing import choose_scene, jev_enabled
from system_settings.models import Agent

from .market_disposition import (aggregate, can_list, can_shop_sell,
                                 reserved_quantity)
from .market_plan_models import (MarketDisposition, MarketDispositionTask,
                                 disposition_id)
from .market_models import MarketListing

QUESTION_LIMIT = 20
RUN_SECONDS = 60
QUESTION_SECONDS = 20
MIN_ASK_QUANTITY = 3
TASK_TIMEOUT = timedelta(minutes=5)


def recover_stale_tasks(owner: str | None = None) -> int:
    """超过单轮执行时限的任务视为中断，保留答案供下一轮续问。"""
    tasks = MarketDispositionTask.objects.filter(
        status='running', updated_at__lte=timezone.now() - TASK_TIMEOUT)
    if owner:
        tasks = tasks.filter(owner_id=owner)
    return tasks.update(status='pending', attempts=0, error='执行中断，沿用已有答案继续',
                        updated_at=timezone.now())


class BudgetExhausted(Exception):
    pass


class ModelUnavailable(Exception):
    pass


class Budget:
    def __init__(self, questions: int = QUESTION_LIMIT, seconds: int = RUN_SECONDS):
        self.questions = questions
        self.deadline = time.monotonic() + seconds

    def can_ask(self) -> bool:
        return self.questions > 0 and time.monotonic() < self.deadline

    def spend(self) -> None:
        self.questions -= 1


def _ask(owner: str, agent, task: MarketDispositionTask, budget: Budget, key: str,
         state: dict, choices: dict, instructions: str) -> str:
    cached = (task.answers or {}).get(key)
    if cached in choices:
        return cached
    if len(choices) == 1:
        selected = next(iter(choices))
    elif not budget.can_ask():
        raise BudgetExhausted()
    else:
        budget.spend()
        selected = choose_scene(
            owner, agent, 'market_disposition', state, choices,
            deadline=time.monotonic() + QUESTION_SECONDS,
            question_id=f'market-disposition:{task.pk}:{key}',
            instructions=instructions, include_role=False, max_probability=True)
        if selected not in choices:
            raise ModelUnavailable()
    task.answers = {**(task.answers or {}), key: selected}
    task.save(update_fields=['answers', 'updated_at'])
    return selected


def _state(owner: str, actor_id: str, sku: str) -> dict:
    entry = next((row for row in aggregate(owner, actor_id) if row['sku'] == sku), None)
    total = entry['quantity'] if entry else 0
    reserved = min(total, reserved_quantity(owner, actor_id, sku))
    listings = MarketListing.objects.filter(owner_id=owner, status='active',
                                            item__source__sku=sku)
    prices = [str(row.unit_price) for row in listings[:20]]
    disposition = MarketDisposition.objects.filter(owner_id=owner, actor_id=actor_id, sku=sku).first()
    return {
        'sku': sku, 'name': entry['name'] if entry else sku,
        'total': total, 'reserved': reserved, 'available': max(0, total - reserved),
        'value': str(entry['value']) if entry else '0',
        'stars': {str(k): v for k, v in (entry['stars'].items() if entry else [])},
        'channels': [name for name, allowed in (('sell', can_shop_sell(sku)), ('list', can_list(sku))) if allowed],
        'own_active_listings': {'count': listings.count(), 'prices': prices},
        'current_policy': ({'target_hold': disposition.target_hold,
                            'sell_ratio': disposition.sell_ratio,
                            'list_ratio': disposition.list_ratio,
                            'star_order': disposition.star_order} if disposition else None),
    }


def _save_policy(owner: str, actor_id: str, sku: str, *, target_hold: int, sell_ratio: int,
                 list_ratio: int, star_order: str, list_price_ratio: str,
                 source: str, status: str, reason: str) -> None:
    identity = disposition_id(owner, actor_id, sku)
    current = MarketDisposition.objects.filter(pk=identity).first()
    MarketDisposition.objects.update_or_create(pk=identity, defaults={
        'owner_id': owner, 'actor_id': actor_id, 'sku': sku,
        'target_hold': max(0, target_hold), 'sell_ratio': max(0, min(100, sell_ratio)),
        'list_ratio': max(0, min(100, list_ratio)), 'star_order': star_order,
        'list_price_ratio': list_price_ratio, 'source': source, 'status': status,
        'reason': reason[:500], 'revision': (current.revision + 1) if current else 1,
    })


def _default(owner: str, actor_id: str, sku: str, state: dict, reason: str) -> None:
    _save_policy(owner, actor_id, sku, target_hold=state['available'], sell_ratio=0,
                 list_ratio=0, star_order='low', list_price_ratio='1.20',
                 source='default', status='review', reason=reason)


def _decide_task(owner: str, agent, task: MarketDispositionTask, budget: Budget) -> None:
    state = _state(owner, task.actor_id, task.sku)
    total = state['total']
    if total <= 0:
        task.status = 'done'
        task.error = ''
        task.save(update_fields=['status', 'error', 'updated_at'])
        return
    disposition = MarketDisposition.objects.filter(
        owner_id=owner, actor_id=task.actor_id, sku=task.sku, status='active').first()
    if disposition:
        # 已有长期策略时，新产出直接套用，不再重复提问。
        task.status = 'done'
        task.error = ''
        task.save(update_fields=['status', 'error', 'updated_at'])
        return

    available = state['available']
    if available <= MIN_ASK_QUANTITY - 1:
        _save_policy(owner, task.actor_id, task.sku, target_hold=available, sell_ratio=0,
                     list_ratio=0, star_order='low', list_price_ratio='1.20',
                     source='default', status='active', reason='存量较少，默认自用')
        task.status = 'done'
        task.error = ''
        task.save(update_fields=['status', 'error', 'updated_at'])
        return

    try:
        mid = available // 2
        hold_choices = {}
        for value, label in ((0, '全部处理'), (mid, f'保留一半（{mid}）'), (available, f'全部自用（{available}）')):
            hold_choices[str(value)] = label
        hold_key = _ask(owner, agent, task, budget, 'hold', state, hold_choices,
                        '决定这个商品长期保留多少自用；超量部分再决定出售或上架。只选一个选项。')
        hold = int(hold_key)
        surplus = max(0, available - hold)
        if surplus <= 0:
            _save_policy(owner, task.actor_id, task.sku, target_hold=hold, sell_ratio=0,
                         list_ratio=0, star_order='low', list_price_ratio='1.20',
                         source='model', status='active', reason=f'保留{hold}，不处置超量')
            task.status = 'done'
            task.error = ''
            task.save(update_fields=['status', 'error', 'updated_at'])
            return

        channels = state['channels']
        if not channels:
            _default(owner, task.actor_id, task.sku, state, '该品类暂无可用的出售或上架渠道')
            task.status = 'done'
            task.save(update_fields=['status', 'updated_at'])
            return
        if len(channels) == 1:
            channel = channels[0]
        else:
            channel = _ask(owner, agent, task, budget, 'channel', state,
                           {'sell': '超量部分全部出售给商店', 'list': '超量部分全部上架',
                            'split': '一部分出售，一部分上架'},
                           '决定超量部分走商店回收还是居民集市挂牌。只选一个选项。')
        if channel == 'split':
            ratio = _ask(owner, agent, task, budget, 'ratio', state,
                         {'25': '出售25%，上架75%', '50': '各一半', '75': '出售75%，上架25%'},
                         '决定超量部分出售与上架的比例。只选一个选项。')
            sell_ratio, list_ratio = {'25': (25, 75), '50': (50, 50), '75': (75, 25)}[ratio]
        elif channel == 'sell':
            sell_ratio, list_ratio = 100, 0
        else:
            sell_ratio, list_ratio = 0, 100

        star_levels = [stars for stars, quantity in state['stars'].items() if quantity]
        if surplus > 1 and len(star_levels) > 1:
            star_order = _ask(owner, agent, task, budget, 'stars', state,
                              {'low': '低星优先处理', 'high': '高星优先处理'},
                              '决定先处理低星还是高星库存。只选一个选项。')
        else:
            star_order = 'low'

        list_qty = surplus * list_ratio // 100
        if list_qty > 0:
            price_key = _ask(owner, agent, task, budget, 'price', state,
                             {'1.00': '按回收价挂牌', '1.20': '回收价的1.2倍',
                              '1.50': '回收价的1.5倍', '2.00': '回收价的2倍'},
                             '决定挂牌单价相对物品回收价的倍数。上架不等于成交。只选一个选项。')
        else:
            price_key = '1.20'
        _save_policy(owner, task.actor_id, task.sku, target_hold=hold,
                     sell_ratio=sell_ratio, list_ratio=list_ratio, star_order=star_order,
                     list_price_ratio=price_key, source='model', status='active',
                     reason=f'留{hold}，超量出售{sell_ratio}%/上架{list_ratio}%，{star_order}星优先')
    except BudgetExhausted:
        task.status = 'pending'
        task.attempts = max(0, task.attempts - 1)
        task.save(update_fields=['status', 'attempts', 'updated_at'])
        raise
    except ModelUnavailable:
        _default(owner, task.actor_id, task.sku, state, '决策模型不可用，暂按自用保留，等待复核')
        task.status = 'done'
        task.error = '决策模型不可用，已按自用保留并标记复核'
        task.save(update_fields=['status', 'error', 'updated_at'])
        return

    task.status = 'done'
    task.error = ''
    task.save(update_fields=['status', 'error', 'updated_at'])


def run(limit: int = QUESTION_LIMIT, seconds: int = RUN_SECONDS, owner: str | None = None) -> dict:
    """处理待标记队列；达到问题数或时长上限时保留剩余任务，下次继续。"""
    budget = Budget(limit, seconds)
    recover_stale_tasks(owner)
    tasks = MarketDispositionTask.objects.filter(status__in=('pending', 'failed'), attempts__lt=3)
    if owner:
        tasks = tasks.filter(owner_id=owner)
    processed = 0
    for task in tasks.order_by('created_at', 'id')[:200]:
        if not budget.can_ask() and budget.questions <= 0:
            break
        agent = Agent.objects.filter(pk=task.actor_id, archived_at__isnull=True).first()
        if not agent:
            task.delete()
            continue
        # 条件更新认领，避免两个本机进程同时消费同一个任务。
        claimed = MarketDispositionTask.objects.filter(
            pk=task.pk, status=task.status, updated_at=task.updated_at).update(
                status='running', attempts=task.attempts + 1, updated_at=timezone.now())
        if not claimed:
            continue
        task.refresh_from_db()
        try:
            _decide_task(owner or task.owner_id, agent, task, budget)
            processed += 1
        except BudgetExhausted:
            break
        except Exception as exc:  # noqa: BLE001 - 单任务失败不能拖垮整个队列
            task.status = 'failed'
            task.error = str(exc)[:500]
            task.save(update_fields=['status', 'error', 'updated_at'])
    return {'processed': processed, 'remaining_questions': budget.questions,
            'pending': tasks.filter(status__in=('pending', 'failed')).count()}


def enqueue_review(owner: str, actor_id: str) -> int:
    """把待复核策略重新入队；由每日规划调用。"""
    from .market_disposition import enqueue
    count = 0
    for disposition in MarketDisposition.objects.filter(owner_id=owner, actor_id=actor_id, status='review'):
        enqueue(owner, actor_id, disposition.sku, 0, source='review',
                operation=f'review:{disposition.revision}')
        count += 1
    return count
