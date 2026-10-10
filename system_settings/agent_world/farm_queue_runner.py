"""农场日程只启动已规划的队列，启动及后续操作均不请求模型。"""
from django.db import transaction
from django.utils import timezone
from system_settings.models import Agent, AgentExecutionLease, AgentRunRecord, WorldAction, WorldActionRuntime
from .execution import execution_lease
from .execution import WorldLeaseBusy
from .life_scope import CURRENT, check_current_authorization
from .farm_gate import guarded
from .farm_models import AgentFarm
from .farm_queue_plan import event, save
from .farm_automation import tend_farm


@guarded
def run_queue_opportunity(task, scheduler=None, *, key, locked=None):
    if not locked:
        with execution_lease(WorldActionRuntime, {'pk': 'world'}) as token:
            if token:
                return run_queue_opportunity(task, scheduler, key=key, locked=token)
        raise WorldLeaseBusy()
    existing = WorldAction.objects.filter(pk=key).first()
    if existing:
        return existing.record
    check_current_authorization()
    from .life_models import LifeItem
    scope = CURRENT.get()
    item = LifeItem.objects.get(pk=scope['item_id'], actor_id=scope['actor_id'], owner_id=scope['owner_id'])
    agent = Agent.objects.get(pk=item.actor_id)
    with transaction.atomic():
        farm = AgentFarm.objects.select_for_update().get(pk=agent.pk, owner_id=item.owner_id)
        plan = farm.state.get('planting_plans', {}).get(item.context.get('farm_plan_id'))
        if not plan or plan['item_id'] != item.pk or plan['task_id'] != task.pk:
            raise ValueError('日程未成功建立种植队列，请重新规划')
        now = timezone.now()
        if now.timestamp() < plan['starts_at']:
            raise ValueError('尚未到个人农场开工时间')
        if now.timestamp() >= plan['cutoff'] and not plan['activated_at']:
            plan['status'] = 'expired'
            event(plan, 'expired', '已超过当天活动截止时间，未启动新播种', now)
            save(farm, now)
        if not plan['activated_at'] and plan['status'] == 'pending' and plan['starts_at'] <= now.timestamp() < plan['cutoff']:
            plan['activated_at'] = now.timestamp(); plan['status'] = 'active'
            event(plan, 'activated', '个人农场日程到点，启动当天种植队列', now)
            save(farm, now)
        record = AgentRunRecord.objects.create(task=task, task_name=task.name, agent=agent, agent_name=agent.name,
            trigger='系统行动', status='success', summary='当天种植队列已启动；后续由程序按实际条件执行' if plan['activated_at'] else '当天队列已截止或取消，未启动新播种', agent_runs=[])
        WorldAction.objects.create(pk=key, task=task, agent=agent, actor_id=agent.pk, record=record, status='success',
            snapshot={'farm': True, 'planting_plan_id': plan['id'], 'activated_at': plan['activated_at']}, result={'reason': record.summary}, effects_done=True)
    from .travel_candidates import travelling_ids
    if agent.pk not in travelling_ids():
        with execution_lease(AgentExecutionLease, {'agent_id': agent.pk}) as token:
            if token:
                tend_farm(agent.pk, locked, token, task, now, force=True)
    return record
