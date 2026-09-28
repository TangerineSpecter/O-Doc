"""旅行复用任务执行记录与世界动态，阶段事实仍由旅行记录表达。"""
from django.db import transaction
from system_settings.models import AgentRunRecord, WorldAction
from system_settings.agent_activity import update_work_activity


@transaction.atomic
def start_activity(journey, manual=False):
    action, _ = WorldAction.objects.get_or_create(pk=journey.pk, defaults={
        'task': journey.task, 'agent': journey.agent, 'actor_id': journey.actor_id,
        'snapshot': {'kind': 'travel'}, 'effects_done': True})
    if action.record_id:
        return
    record = AgentRunRecord.objects.create(task=journey.task, task_name='旅行', agent=journey.agent,
        agent_name=journey.snapshot.get('agent_name', ''), trigger='手动执行' if manual else '定时任务',
        summary='正在准备旅行目的地', random_context={'journey_id': journey.pk})
    action.record = record
    action.save(update_fields=['record', 'updated_at'])
    update_work_activity(record, journey.agent, current_action='正在准备旅行目的地')


def update_activity(journey, error=''):
    action = WorldAction.objects.filter(pk=journey.pk).select_related('record').first()
    if not action or not action.record_id:
        return
    record = action.record
    completed = journey.status in ['completed', 'skipped']
    record.status = 'success' if completed else 'failed' if journey.status == 'manual' else 'running'
    record.summary = ('本次不出行' if journey.status == 'skipped' else '旅行日记已发布' if completed else error or f'旅行阶段：{journey.phase}')[:255]
    record.output = journey.snapshot.get('draft', {}).get('content', '')
    record.save(update_fields=['status', 'summary', 'output', 'updated_at'])
    if journey.agent:
        update_work_activity(record, journey.agent, status=record.status, summary=record.summary,
                             current_action=record.summary, output=record.output)
    if journey.status == 'skipped':
        action.status = 'skipped'
        action.save(update_fields=['status', 'updated_at'])
    if journey.status == 'completed' and journey.task and journey.task.notify_enabled:
        action.snapshot = {**action.snapshot, 'notification_pending': True}
        action.save(update_fields=['snapshot', 'updated_at'])
