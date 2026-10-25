from quant.models import IntakeBatch, IntakeBatchJob, IntakeOutcome, SourceRevision, ResearchReport
from quant.worker import recover as recover_run
from .contracts import ACTIVE, SKIPS
from .services import recover


def batch_data(batch):
    job = IntakeBatchJob.objects.filter(batch=batch).first()
    if job:
        recover(job)
    outcome = IntakeOutcome.objects.filter(batch=batch).first()
    status = outcome.data['status'] if outcome else job.status if job else 'interrupted'
    steps = {step.ordinal: step for step in batch.dispatches.select_related('run')}
    sources = {row.pk: row for row in SourceRevision.objects.filter(pk__in=batch.plan['sources']).select_related('material__entry')}
    reports = {report.run_id: report.pk for report in ResearchReport.objects.filter(run_id__in=[s.run_id for s in steps.values() if s.run_id])}
    items = []
    for ordinal, identity in enumerate(batch.plan['sources'], 1):
        source, step = sources[identity], steps.get(ordinal)
        run = recover_run(step.run) if step and step.run else None
        items.append({'ordinal': ordinal, 'source_id': identity, 'entry_id': source.material.entry_id,
            'title': source.material.entry.title, 'available': source.material.entry.is_valid,
            'status': run.status if run else 'rejected' if step else 'waiting' if status in ACTIVE else 'not_started',
            'message': run.error if run else SKIPS.get(step.reason, '') if step else '',
            'run_id': run.pk if run else None, 'report_id': reports.get(run.pk) if run else None})
    return {'id': batch.pk, 'name': batch.plan['name'], 'created_at': batch.created_at.isoformat(), 'status': status,
        'retry_batch_id': IntakeBatch.objects.filter(anthology=batch.anthology, plan__parent_id=batch.pk).values_list('id', flat=True).first(),
        'message': outcome.data['message'] if outcome else '' if job else '此设备没有执行权限；重试才会启动新分析',
        'plan': batch.plan, 'outcome': outcome.data if outcome else None, 'items': items,
        'completed': sum(item['status'] == 'completed' for item in items),
        'reserved_calls': sum(bool(step.run_id) for step in steps.values()), 'call_limit': len(items) if batch.plan['analyze'] else 0}
