"""本机执行互斥与成功行动的体力重放。"""
import threading
import uuid
from collections.abc import Iterable
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta
from decimal import Decimal

from django.db import close_old_connections
from django.db.models import Q
from django.utils import timezone

from system_settings.models import Agent, WorldAction

ENERGY_MAX = Decimal('100')
INTERACTION_COST = Decimal('10')
# 生活调度在占用失败时要保留原安排。手动执行仍走忙碌跳过。
defer_when_world_busy = ContextVar('defer_when_world_busy', default=False)
agent_tokens = ContextVar('agent_execution_tokens', default=None)


class WorldLeaseBusy(Exception):
    """世界执行位被占用，调用方应把生活安排留在原时间。"""


def stamina(agent, now=None) -> Decimal:
    """从唯一消费事件计算，换设备后不把可变余额当作结算依据。"""
    return resident_stamina([agent], now)[agent.pk]


def resident_stamina(agents: Iterable[Agent], now=None) -> dict[str, Decimal]:
    """按居民批量回放同一时刻的余额，每次只读取一份恢复规则。"""
    from .stamina_settings import history, recovered_between

    now = now or timezone.now()
    previous = {agent.pk: agent.created_at for agent in agents}
    if not previous:
        return {}
    balances = dict.fromkeys(previous, ENERGY_MAX)
    recovery_history = history()
    actions = WorldAction.objects.filter(
        actor_id__in=balances, status='success', consumed_at__lte=now,
    ).order_by('actor_id', 'consumed_at', 'pk').values_list('actor_id', 'consumed_at', 'energy_cost')
    for actor, consumed, cost in actions.iterator():
        recovered = recovered_between(previous[actor], consumed, recovery_history)
        balances[actor] = max(Decimal('0'), min(ENERGY_MAX, balances[actor] + recovered) - cost)
        previous[actor] = max(previous[actor], consumed)
    return {actor: min(ENERGY_MAX, balance + recovered_between(previous[actor], now, recovery_history))
            for actor, balance in balances.items()}


@contextmanager
def execution_lease(model, lookup: dict, *, token_prefix='', promotion_run_id: str = ''):
    agent_id = None
    if model.__name__ in ('AgentExecutionLease', 'AgentMemoryLease'):
        agent_id = getattr(lookup.get('agent'), 'pk', None) or lookup.get('agent_id') or lookup.get('pk')
        from system_settings.agent_availability import require_active_agent
        current = require_active_agent(agent_id)
        existing = (agent_tokens.get() or {}).get((model.__name__, str(agent_id)))
        if existing:
            if not model.objects.filter(pk=current.pk, token=existing, until__gt=timezone.now()).exists():
                raise ValueError('居民执行授权已失效')
            yield existing
            return
    token = token_prefix + uuid.uuid4().hex
    if not token_prefix and model.__name__=='AgentExecutionLease':
        from .life_scope import CURRENT
        if CURRENT.get():token='life:'+token  # 本机命名空间，恢复不撤销自定义任务的租约。
    from .farm_gate import farm_gate
    with farm_gate():
        if agent_id:
            require_active_agent(agent_id)
        row, _ = model.objects.get_or_create(**lookup)
        from .combat.models import Exploration
        occupied = False
        if model.__name__ == 'AgentExecutionLease':
            explorations = Exploration.objects.filter(
                actor_id=row.agent_id, status__in=['preparing', 'active', 'paused', 'settling'],
            )
            # Only the promotion task may enter its own paused run; other runs and
            # the resident's existing task lease still participate in the mutex.
            if promotion_run_id and explorations.filter(
                pk=promotion_run_id, status='paused', phase__in=['promotion', 'promotion_failed', 'interrupted'],
            ).exists():
                explorations = explorations.exclude(pk=promotion_run_id)
            from .fishing.models import FishingTrip
            occupied = explorations.exists() or FishingTrip.objects.filter(actor_id=row.agent_id, ended_at__isnull=True).exists()
        acquired = 0 if occupied else model.objects.filter(pk=row.pk).filter(
            Q(until__isnull=True) | Q(until__lte=timezone.now()),
        ).update(token=token, until=timezone.now() + timedelta(minutes=10))
    stop = threading.Event()

    def heartbeat():
        while not stop.wait(30):
            try:
                close_old_connections()
                if not model.objects.filter(pk=row.pk, token=token).update(until=timezone.now() + timedelta(minutes=10)):
                    break
            finally:
                close_old_connections()

    worker = threading.Thread(target=heartbeat, daemon=True, name='world-action-lease') if acquired else None
    if worker:
        worker.start()
    marker = agent_tokens.set({**(agent_tokens.get() or {}), (model.__name__, str(agent_id)): token}) if acquired and agent_id else None
    try:
        yield token if acquired else None
    finally:
        if marker is not None:
            agent_tokens.reset(marker)
        stop.set()
        if worker:
            worker.join(timeout=1)
            model.objects.filter(pk=row.pk, token=token).update(token='', until=None)
