"""当前模型调用的指定居民与上下文；不授予跨设备执行权。"""
from contextlib import contextmanager
from contextvars import ContextVar

CURRENT = ContextVar('life_execution', default=None)


@contextmanager
def life_scope(item, context):
    token = CURRENT.set({'item_id': item.pk, 'actor_id': item.actor_id, 'owner_id': item.owner_id, 'context': context})
    try:
        yield
    finally:
        CURRENT.reset(token)


def enrich(context):
    scope = CURRENT.get()
    return {**context, 'life': scope['context']} if scope else context


def allowed(task, actor_id):
    from .life_config import task_owner, config_for, effective_settings
    from .life_models import LifeProfile
    profile = LifeProfile.objects.filter(pk=actor_id).first()
    owner = task_owner(task)
    if profile and owner:
        config = config_for(owner)
        participants=effective_settings(config).get('agent_ids', [])
        scope=CURRENT.get()
        if scope and scope['actor_id']==actor_id:
            from .life_models import LifeItem
            item=LifeItem.objects.select_related('cycle').filter(pk=scope['item_id'],owner_id=owner).first()
            if item and item.cycle:participants=item.cycle.snapshot.get('participants',item.cycle.snapshot.get('settings',{}).get('agent_ids',[]))
        return profile.owner_id == owner and actor_id in participants and actor_id not in config.paused_agents
    return actor_id in (task.agent_ids or [task.agent_id])


def check_item_authorization(item):
    from .life_config import config_for
    from system_settings.models import WorldActionRuntime,AgentTask
    config = config_for(item.owner_id)
    from .life_schedule import OPEN
    if item.status not in OPEN:raise ValueError('生活安排已结束')
    if item.task_id and not AgentTask.objects.filter(pk=item.task_id,enabled=True).exists():
        raise ValueError('生活活动已停用或删除')
    if item.actor_id in config.paused_agents or (not item.context.get('manual') and not WorldActionRuntime.objects.filter(pk='world', enabled=True).exists()):
        raise ValueError('居民或本机自动执行已暂停')


def check_current_authorization():
    scope=CURRENT.get()
    if scope:
        from .life_models import LifeItem
        check_item_authorization(LifeItem.objects.get(pk=scope['item_id']))
