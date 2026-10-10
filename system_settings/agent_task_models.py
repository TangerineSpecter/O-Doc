"""任务只覆盖推理模型；角色身份、记忆和工具权限仍属于执行 Agent。"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import Agent, AgentTask


def task_model_id(task: 'AgentTask | None', agent: 'Agent') -> str | None:
    return getattr(task, 'model_id', None) or agent.model_id


def task_model_name(task: 'AgentTask | None', agent: 'Agent', default: str = '未知') -> str:
    """执行快照与实际调用使用同一任务覆盖规则，不改写居民的默认模型。"""
    model = task.model if getattr(task, 'model_id', None) else agent.model
    return ((model.name or '').strip() or default) if model else default
