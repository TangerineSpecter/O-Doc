"""日终判断包含已安排的自定义任务；间隔任务由时间窗口兜底。"""
from system_settings.models import AgentTask, AgentRunRecord
from .life_time import storage_time


def pending_custom(agent, now):
    if AgentRunRecord.objects.filter(agent=agent, status='running').exists(): return True
    for task in AgentTask.objects.filter(task_kind='custom', enabled=True):
        if agent.pk not in (task.agent_ids or [task.agent_id]): continue
        if task.schedule_type == 'interval': return True
        if task.schedule_type == 'weekly' and str(task.schedule_weekday) != str(now.weekday()): continue
        if task.schedule_type == 'monthly' and str(task.schedule_month_day) != str(now.day): continue
        try:
            hour, minute = map(int, task.schedule_time.split(':'))
            now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        except (ValueError, AttributeError): return True
        if not AgentRunRecord.objects.filter(task=task, agent=agent, started_at__gte=storage_time(now.replace(hour=0, minute=0, second=0, microsecond=0))).exists():
            return True
    return False
