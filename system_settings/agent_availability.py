"""当前居民的执行边界；历史查询仍能读取归档居民。"""
from contextlib import contextmanager

from .models import Agent, AgentExecutionLease


class AgentUnavailableError(ValueError):
    """居民暂时没有执行资格，批量维护可跳过后继续处理其他居民。"""


def require_active_agent(agent):
    identity = getattr(agent, 'pk', agent)
    current = Agent.objects.filter(pk=identity).first()
    if current is None:
        raise AgentUnavailableError('居民不存在')
    if current.archived:
        raise AgentUnavailableError('居民已归档，请先恢复')
    return current


@contextmanager
def agent_operation(agent, *, promotion_run_id: str = ''):
    from .agent_world.execution import execution_lease
    current = require_active_agent(agent)
    with execution_lease(AgentExecutionLease, {'agent': current}, promotion_run_id=promotion_run_id) as token:
        if not token:
            raise AgentUnavailableError('居民正在执行其他任务，请稍后重试')
        yield current
