"""旅行复用任务执行记录与世界动态，阶段事实仍由旅行记录表达。"""
from django.db import transaction
from django.utils import timezone
from system_settings.models import AgentRunRecord, WorldAction
from system_settings.agent_activity import update_work_activity

PHASE_LABELS = {'preview': '准备候选目的地', 'choose': '选择目的地', 'plan': '整理当地行程',
    'depart': '出发', 'food': '体验当地美食', 'buy': '选购纪念品', 'return': '返程',
    'journal': '撰写旅行日记', 'publish': '发布旅行日记', 'done': '旅行结束', 'debug-shopping': '本地调试补录纪念品'}


def phase_label(phase):
    if phase.startswith('visit'):
        return '游览景点'
    if phase.startswith('event'):
        return '旅途遭遇'
    return PHASE_LABELS.get(phase, phase)


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
    record.summary = ('本次不出行' if journey.status == 'skipped' else '旅行日记已发布' if completed else error or f'旅行阶段：{phase_label(journey.phase)}')[:255]
    if journey.phase == 'preview' and not error:
        record.summary += f"（{len(journey.snapshot.get('previews', []))}/{len(journey.snapshot.get('candidates', []))}）"
    record.output = journey.snapshot.get('draft', {}).get('content', '')
    elapsed = max(0, int((timezone.now() - record.started_at).total_seconds()))
    record.duration = f'{elapsed // 60}m {elapsed % 60}s'
    steps = []
    for node in journey.nodes.order_by('updated_at', 'id'):
        detail = node.error or ('处理完成' if node.status == 'success' or node.result else '正在处理' if node.status == 'running' else '等待处理')
        if node.kind == 'debug-shopping':
            detail = '本地调试数据，未扣余额；保留 Agent 原来的购物决定。'
        title = phase_label(node.kind)
        if node.kind == 'preview' and node.input.get('city'):
            title += f"：{node.input.get('country', '')} · {node.input['city']}"
        when = timezone.localtime(node.updated_at) if timezone.is_aware(node.updated_at) else node.updated_at
        steps.append({'time': when.strftime('%Y-%m-%d %H:%M:%S'),
            'status': 'failed' if node.error else 'success' if node.status == 'success' or node.result else 'running',
            'title': title, 'detail': detail})
    record.steps = steps
    record.save(update_fields=['status', 'summary', 'output', 'steps', 'duration', 'updated_at'])
    if journey.agent:
        update_work_activity(record, journey.agent, status=record.status, summary=record.summary,
                             current_action=record.summary, output=record.output)
    if journey.status == 'skipped':
        action.status = 'skipped'
        action.save(update_fields=['status', 'updated_at'])
    if journey.status == 'completed' and journey.task and journey.task.notify_enabled:
        action.snapshot = {**action.snapshot, 'notification_pending': True}
        action.save(update_fields=['snapshot', 'updated_at'])
