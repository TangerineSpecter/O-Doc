"""本机投资凭证，包括尚未创建决策的行情准备阶段。"""
from contextlib import ExitStack, contextmanager
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentExecutionLease, WorldAction
from .execution import execution_lease
from .farm_gate import farm_gate
from .investment_models import InvestmentCache

PREFIX = 'investment-execution:'


def check_lease(agent: Agent, token: str) -> None:
    if not AgentExecutionLease.objects.filter(agent_id=agent.pk, token=token, until__gt=timezone.now()).exists():
        raise ValueError('投资执行授权已失效')


@contextmanager
def investment_lease(agent: Agent, opportunity: str):
    # Acquire and register under the restore lock so restoration cannot miss
    # the gap between acquiring a resident lease and starting market queries.
    key = PREFIX + opportunity
    with ExitStack() as stack:
        with farm_gate(), transaction.atomic():
            if not WorldAction.objects.filter(pk=opportunity, snapshot__investment=True, effects_done=False).exists():
                raise ValueError('投资机会已结束')
            token = stack.enter_context(execution_lease(AgentExecutionLease, {'agent': agent}))
            if token:
                InvestmentCache.objects.update_or_create(pk=key, defaults={
                    'payload': {'actor_id': agent.pk, 'token': token},
                    'expires_at': timezone.now() + timedelta(minutes=10),
                })
        try:
            yield token
        finally:
            if token:
                with farm_gate():
                    InvestmentCache.objects.filter(pk=key, payload__token=token).delete()


def revoke_investment_leases() -> None:
    """调用方持有恢复锁和事务；只撤销登记且仍匹配的投资租约。"""
    for row in InvestmentCache.objects.filter(pk__startswith=PREFIX):
        AgentExecutionLease.objects.filter(
            agent_id=row.payload['actor_id'], token=row.payload['token'],
        ).update(token='', until=None)
    InvestmentCache.objects.filter(pk__startswith=PREFIX).delete()
