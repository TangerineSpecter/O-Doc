"""手动活动明确选人，使用同一生活事实和资金预留规则。"""
from decimal import Decimal
from django.utils import timezone
from system_settings.models import Agent
from .life_budget_policy import allows_spending, remaining_reservation
from .life_models import LifeItem
from .life_scope import life_scope
from .life_context import build_context
from .life_schedule import OPEN, stable_id, revise


def run_manual_life(task, actor, owner, scheduler):
    agent=Agent.objects.get(pk=actor)
    now=timezone.now()
    reserved=sum((remaining_reservation(r) for r in LifeItem.objects.filter(owner_id=owner,actor_id=actor,status__in=OPEN)),Decimal(0))
    budget = max(Decimal(0), agent.money-reserved) if allows_spending(task.task_kind) else Decimal(0)
    item=LifeItem.objects.create(pk=stable_id('manual',task.pk,actor,now.isoformat()),owner_id=owner,actor_id=actor,original_at=now,scheduled_at=now,activity=task.task_kind,task_id=task.pk,status='running',intent='用户手动执行',budget=budget,context={'manual':True})
    try:
        with life_scope(item,build_context(owner,agent,item)):
            record=scheduler._run_task(task,trigger='手动执行')
        if task.task_kind not in ('travel','exploration'):
            item.refresh_from_db()
            from .life_planner import check_goals
            check_goals(owner,agent)
            revise(item,'手动活动结束',status='failed' if not record or record.status=='failed' else 'completed',record_id=record.pk if record else '',result={'reason':record.summary if record else '手动执行结束'})
    except Exception as exc:
        item.refresh_from_db();revise(item,'手动活动失败',status='failed',result={'reason':str(exc)[:500]})
