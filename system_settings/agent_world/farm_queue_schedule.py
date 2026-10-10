"""日程修改与队列生命周期衔接，不重建已执行进度。"""
from django.utils import timezone
from .farm_models import AgentFarm
from .farm_queue_plan import save, event
from .life_time import local_time


def cancel(item, reason: str) -> None:
    farm = AgentFarm.objects.select_for_update().filter(pk=item.actor_id, owner_id=item.owner_id).first()
    plan = farm.state.get('planting_plans', {}).get(item.context.get('farm_plan_id')) if farm else None
    if plan and plan['status'] not in ('cancelled', 'expired'):
        plan['status'] = 'cancelled'
        event(plan, 'cancelled', '取消未播种项目：' + reason, timezone.now())
        save(farm)


def changed(item, reason: str) -> None:
    farm = AgentFarm.objects.select_for_update().filter(pk=item.actor_id, owner_id=item.owner_id).first()
    plan = farm.state.get('planting_plans', {}).get(item.context.get('farm_plan_id')) if farm else None
    if not plan:
        return
    if item.activity != 'farm' or item.status == 'cancelled':
        cancel(item, reason)
    elif not plan['activated_at']:
        plan['starts_at'] = local_time(item.scheduled_at).timestamp()
        save(farm)
