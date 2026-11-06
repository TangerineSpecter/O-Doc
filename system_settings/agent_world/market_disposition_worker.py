"""逐题询问决策模型，按居民、日期和 sku 复核用途保留策略。

问题拆开问：持有量、渠道、比例、星级顺序、挂牌价。禁止把数量与星级合并成
笛卡尔候选；每个答案写入任务缓存，重启或限流后不重掷。
"""
import logging
import time
from datetime import timedelta

from django.utils import timezone

from system_settings.decision.routing import choose_scene
from system_settings.models import Agent

from .market_disposition import (aggregate, can_list, can_shop_sell,
                                 reserved_quantity)
from .market_plan_models import MarketDisposition, MarketDispositionTask
from .market_models import MarketListing

QUESTION_LIMIT = 20
RUN_SECONDS = 60
QUESTION_SECONDS = 20
TASK_TIMEOUT = timedelta(minutes=5)
logger = logging.getLogger(__name__)


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
        if state.get('crafting_demand'):
            instructions = (
                f'{instructions} 请参考 crafting_demand 中排除当前居民后的总居民数和需求居民数；'
                '需求人数按当前等级、配方和可用库存下“购买1件该 SKU 会增加至少一种配方可制作数量”计算。'
                'status 为 partial/unavailable 或需求人数为 null 表示统计不完整或未知，不能当作零需求。'
                '它用于判断市场需求，不是禁止上架的硬条件，仍由你在给定选项中决策。'
            )
        selected = choose_scene(
            owner, agent, 'market_disposition', state, choices,
            deadline=min(budget.deadline, time.monotonic() + QUESTION_SECONDS),
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
    forge_goals = []
    if sku.startswith('combat.material.'):
        from .blacksmith_goals import summary as forge_summary
        for goal in forge_summary(owner, actor_id)['goals']:
            ingredient = next((row for row in goal['ingredients'] if row['sku'] == sku), None)
            if ingredient:
                forge_goals.append({'goal_id': goal['id'], 'equipment': goal['type_name'],
                                    'required': ingredient['required'], 'available': ingredient['available'],
                                    'missing': ingredient['missing']})
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
                            'star_order': disposition.star_order, 'strategy': disposition.strategy} if disposition else None),
        'forge_goals': forge_goals,
    }


def _decide_task(owner: str, agent, task: MarketDispositionTask, budget: Budget) -> None:
    from .life_time import local_time
    if local_time(task.created_at).date() < local_time(timezone.now()).date():
        task.status, task.error = 'done', '旧日期复核结束，由今日重新制定'
        task.save(update_fields=['status', 'error', 'updated_at'])
        return
    state = _state(owner, task.actor_id, task.sku)
    total = state['total']
    if total <= 0 and reserved_quantity(owner, task.actor_id, task.sku) <= 0:
        task.status = 'done'
        task.error = ''
        task.save(update_fields=['status', 'error', 'updated_at'])
        return
    from .market_policy_review import decide
    try:
        decide(owner, agent, task, budget, state, _ask)
    except BudgetExhausted:
        task.status = 'pending'
        task.attempts = max(0, task.attempts - 1)
        task.save(update_fields=['status', 'attempts', 'updated_at'])
        raise
    except ModelUnavailable:
        task.status, task.error = 'failed', '决策连接不可用，保留最近完整策略，等待复核'
        task.save(update_fields=['status', 'error', 'updated_at'])
        return
    task.status, task.error = 'done', ''
    task.save(update_fields=['status', 'error', 'updated_at'])


def run(limit: int = QUESTION_LIMIT, seconds: int = RUN_SECONDS, owner: str | None = None, *, automatic: bool = False) -> dict:
    """处理待标记队列；达到问题数或时长上限时保留剩余任务，下次继续。"""
    budget = Budget(limit, seconds)
    recover_stale_tasks(owner)
    tasks = MarketDispositionTask.objects.filter(status__in=('pending', 'failed'), attempts__lt=3)
    if owner:
        tasks = tasks.filter(owner_id=owner)
    if automatic:
        from django.db.models import Q
        from system_settings.models import WorldActionRuntime
        from .life_config import market_automation_enabled, effective_settings
        from .life_models import LifeConfig
        allowed = Q(pk__in=[])
        if WorldActionRuntime.objects.filter(pk='world', enabled=True).exists():
            for config in LifeConfig.objects.filter(migrated=True):
                if market_automation_enabled(config):
                    actors = set(effective_settings(config).get('agent_ids', [])) - set(config.paused_agents or [])
                    allowed |= Q(owner_id=config.pk, actor_id__in=actors)
        tasks = tasks.filter(allowed)
    processed = 0
    for task in tasks.order_by('created_at', 'id')[:200]:
        if not budget.can_ask():
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
    """Daily review covers all stock and live commitments, not just fallback policies."""
    from .inventory_protection import commitments
    from .market_disposition import enqueue, disposable
    from .inventory_policy import is_current
    from .life_time import local_time
    day = local_time(timezone.now()).date().isoformat()
    skus = {entry['sku'] for entry in aggregate(owner, actor_id)}
    skus.update(d['sku'] for d in commitments(owner, actor_id) if disposable(d['sku']))
    policies = {p.sku: p for p in MarketDisposition.objects.filter(owner_id=owner, actor_id=actor_id)}
    count = 0
    for sku in sorted(skus):
        policy = policies.get(sku)
        if is_current(policy) and policy.strategy['reviewed_date'] == day:
            continue
        enqueue(owner, actor_id, sku, 0, source='review')
        count += 1
    return count
