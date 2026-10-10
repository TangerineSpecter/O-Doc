"""本机执行互斥与成功行动的体力重放。"""
import threading
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import timedelta
from decimal import Decimal

from django.db import close_old_connections
from django.db.models import Q
from django.utils import timezone

from system_settings.models import WorldAction

ENERGY_MAX = Decimal('100')
INTERACTION_COST = Decimal('10')
RECOVERY_PER_HOUR = Decimal('5')
# 生活调度在占用失败时要保留原安排。手动执行仍走忙碌跳过。
defer_when_world_busy = ContextVar('defer_when_world_busy', default=False)


class WorldLeaseBusy(Exception):
    """世界执行位被占用，调用方应把生活安排留在原时间。"""


def stamina(agent, now=None) -> Decimal:
    """从唯一消费事件计算，换设备后不把可变余额当作结算依据。"""
    now = now or timezone.now()
    energy, previous = ENERGY_MAX, agent.created_at
    for action in WorldAction.objects.filter(actor_id=agent.pk, status='success', consumed_at__lte=now).order_by('consumed_at', 'pk'):
        elapsed = max(0, (action.consumed_at - previous).total_seconds())
        energy = max(Decimal('0'), min(ENERGY_MAX, energy + Decimal(str(elapsed)) * RECOVERY_PER_HOUR / 3600) - action.energy_cost)
        previous = max(previous, action.consumed_at)
    return min(ENERGY_MAX, energy + Decimal(str(max(0, (now - previous).total_seconds()))) * RECOVERY_PER_HOUR / 3600)


@contextmanager
def execution_lease(model, lookup: dict):
    token = uuid.uuid4().hex
    if model.__name__=='AgentExecutionLease':
        from .life_scope import CURRENT
        if CURRENT.get():token='life:'+token  # 本机命名空间，恢复不撤销自定义任务的租约。
    from .farm_gate import farm_gate
    with farm_gate():
        row, _ = model.objects.get_or_create(**lookup)
        from .combat.models import Exploration
        occupied = model.__name__ == 'AgentExecutionLease' and Exploration.objects.filter(
            actor_id=row.agent_id, status__in=['preparing', 'active', 'paused', 'settling'],
        ).exists()
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
    try:
        yield token if acquired else None
    finally:
        stop.set()
        if worker:
            worker.join(timeout=1)
            model.objects.filter(pk=row.pk, token=token).update(token='', until=None)
