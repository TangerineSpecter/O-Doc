"""Exploration is a living activity with a device-local opt-in."""
import hashlib
from contextvars import ContextVar
from django.db import transaction
from ..farm_gate import guarded
from system_settings.models import Agent, AgentTask, AgentRunRecord
from .models import CombatRuntime, Exploration
from .explorations import request
from ..life_scope import CURRENT, allowed

PREPARING=ContextVar('combat_preparing',default='')


def occupied_ids():
    return Exploration.objects.filter(status__in=['preparing','active','paused','settling']).values_list('actor_id',flat=True)


def automatic_enabled(owner: str) -> bool:
    return CombatRuntime.objects.filter(pk='auto:'+owner,auto_enabled=True).exists()


def ensure_task(owner: str) -> AgentTask:
    from ..life_models import LifeProfile
    from ..life_config import config_for
    identity='builtin-explore:'+hashlib.sha256(owner.encode()).hexdigest()[:24]
    participants=config_for(owner).settings.get('agent_ids',[]) or list(LifeProfile.objects.filter(owner_id=owner).values_list('pk',flat=True))
    participants=list(Agent.objects.filter(pk__in=participants).values_list('pk',flat=True))
    if not participants:raise ValueError('请先在统一生活中选择参与居民')
    task,_=AgentTask.objects.get_or_create(pk=identity,defaults={'task_kind':'exploration','name':'迷宫探索','exploration_config':{'owner_id':owner},'agent_id':participants[0],'agent_ids':participants,'enabled':True})
    return task


@guarded
@transaction.atomic
def run_opportunity(task,scheduler,key=None,manual=False):
    from ..life_models import LifeItem
    from ..life_config import task_owner
    scope=CURRENT.get()
    owner=task_owner(task)
    if not scope:raise ValueError('缺少统一生活安排')
    item=LifeItem.objects.get(pk=scope['item_id'])
    if not item.context.get('manual') and not automatic_enabled(owner):raise ValueError('自动探索尚未开启')
    agent=Agent.objects.get(pk=scope['actor_id'])
    if not task.enabled or not allowed(task,agent.pk):raise ValueError('探索任务或居民已暂停')
    run=request(owner,agent,key,{},life_item=item)
    if not run.record_id:
        record=AgentRunRecord.objects.create(task=task,agent=agent,agent_name=agent.name,task_name='迷宫探索',trigger='生活安排',summary='准备探索')
        run.record_id=record.pk;run.save()
        from .facts import append
        from .models import CombatProfile
        append(CombatProfile.objects.get(pk=agent.pk),run.pk+':record','record',{'record_id':record.pk},run)
    return AgentRunRecord.objects.get(pk=run.record_id)
