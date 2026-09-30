"""在既有执行步骤中保存阶段和终态；不增加同步字段或重放业务。"""
from django.db import transaction
from django.utils import timezone
from system_logs.capture import sanitize
from system_settings.models import AgentRunRecord
from .life_time import local_time


def failure_detail(stage, error):
    return f'{stage}失败（{type(error).__name__}）：{sanitize(str(error), 1000)}'


def append_step(record, title, detail='', status='info'):
    step = {'time': local_time().strftime('%Y-%m-%d %H:%M:%S'),
            'status': status, 'title': title, 'detail': sanitize(str(detail), 2000)}
    record.steps = [*(record.steps or []), step]
    record.agent_runs = [{**run, 'steps': [*(run.get('steps') or []), step]}
                         for run in record.agent_runs or []]


def progress(record, title, detail='', status='info', *, allow_terminal=False):
    with transaction.atomic():
        current = AgentRunRecord.objects.select_for_update().get(pk=record.pk)
        if current.status != 'running' and not allow_terminal:
            return
        append_step(current, title, detail, status)
        current.save(update_fields=['steps', 'agent_runs', 'updated_at'])
        record.steps, record.agent_runs = current.steps, current.agent_runs


def finish_record(record, status, summary, output, title='本次机会结束'):
    """恢复或重试只补一次终态步骤，保留已记录的阶段与工具失败。"""
    with transaction.atomic():
        current = AgentRunRecord.objects.select_for_update().get(pk=record.pk)
        last = (current.steps or [{}])[-1]
        if current.status == 'running' or last.get('title') != title or last.get('status') != status:
            append_step(current, title, summary, status)
        current.status, current.summary, current.output = status, str(summary)[:255], output
        elapsed = max(0, int((timezone.now() - current.started_at).total_seconds()))
        if not current.duration:
            current.duration = f'{elapsed // 60}分{elapsed % 60}秒' if elapsed >= 60 else f'{elapsed}秒'
        current.agent_runs = [{**run, 'status': status, 'summary': current.summary,
                               'content': output, 'duration': current.duration}
                              for run in current.agent_runs or []]
        current.save(update_fields=['status', 'summary', 'output', 'duration', 'steps', 'agent_runs', 'updated_at'])
        record.refresh_from_db()
