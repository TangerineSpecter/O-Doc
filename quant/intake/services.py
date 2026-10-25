"""Archive all materials atomically, then authorize bounded sequential analysis."""
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import IntakeBatch, IntakeBatchJob, IntakeOutcome, SourceRevision, Job
from quant.research.contracts import digest
from quant.research.intake import collect
from quant.services import Conflict, ModelUnavailable, model_config
from .contracts import ACTIVE, REASONS, validate_plan


def stop_children(batch):
    from quant.worker import interrupt
    for step in batch.dispatches.select_related('run'):
        run = step.run
        if run and run.status in ACTIVE:
            Job.objects.filter(run=run).update(cancelled=True, stage='批次已停止', lease_until=None)
            run.status, run.error = 'cancelled', '批次已停止'
            run.save(update_fields=['status', 'error', 'updated_at'])
            interrupt(run.pk)


def outcome_data(batch, reason):
    steps = list(batch.dispatches.select_related('run'))
    complete = sum(bool(step.run and step.run.status == 'completed') for step in steps)
    status = ('completed' if complete == len(batch.plan['sources']) else 'partial') if reason == 'completed' else reason
    return {'version': 1, 'reason': reason, 'status': status, 'message': REASONS[reason],
        'dispatched': len(steps), 'reserved_calls': sum(bool(step.run_id) for step in steps), 'completed': complete}


def finish(batch, reason):
    stop_children(batch)
    data = outcome_data(batch, reason)
    IntakeOutcome.objects.get_or_create(id=digest(['intake-outcome-v1', batch.pk])[:40],
        defaults={'batch': batch, 'data': data, 'content_hash': digest(data)})
    job = IntakeBatchJob.objects.filter(batch=batch).first()
    if job:
        job.status, job.lease_until = data['status'], None
        job.save(update_fields=['status', 'lease_until', 'updated_at'])


def recover(job):
    if job.status not in ACTIVE:
        return job
    with collection_lock(job.batch.anthology_id), transaction.atomic():
        job.refresh_from_db()
        if job.status not in ACTIVE:
            return job
        if timezone.now() >= job.deadline:
            finish(job.batch, 'wall_budget')
        elif not job.lease_until or job.lease_until <= timezone.now():
            if not queue_liveness.alive(f'intake:{job.pk}', job.lease_token):
                finish(job.batch, 'interrupted')
        job.refresh_from_db()
        return job


def existing_request(collection, key, fingerprint):
    existing = IntakeBatch.objects.filter(anthology=collection, request_key=key).first()
    if existing and existing.plan['request_hash'] != fingerprint:
        raise Conflict('请求标识已用于其他收集批次')
    return existing


def create_batch(collection, data, fingerprint, sources, parent_id=''):
    from .worker import dispatch
    selected = data['model_id']
    available = False
    if data.get('analyze', True):
        try:
            selected = str(model_config(selected)['model_id'])
            available = True
        except (ModelUnavailable, ValidationError):
            pass  # Archive succeeds without a model; no permission is granted.
    plan = validate_plan({'version': 1, 'name': data.get('name', '重试未完成资料'), 'sources': sources,
        'analyze': data.get('analyze', True), 'model_id': selected, 'wall_seconds': data['wall_seconds'],
        'parent_id': parent_id, 'request_hash': fingerprint})
    batch = IntakeBatch.objects.create(id=digest(['intake-batch-v1', collection.pk, data['request_key']])[:40],
        anthology=collection, request_key=data['request_key'], plan=plan, content_hash=digest(plan))
    if not plan['analyze'] or not available:
        finish(batch, 'waiting_model' if plan['analyze'] else 'archived')
    else:
        job = IntakeBatchJob.objects.create(batch=batch, owner_id=collection.user_id,
            lease_until=timezone.now() + timedelta(minutes=3),
            deadline=timezone.now() + timedelta(seconds=plan['wall_seconds']))
        transaction.on_commit(lambda: dispatch(job.pk))
    return batch


def check_capacity(collection):
    for job in IntakeBatchJob.objects.filter(batch__anthology=collection, status__in=ACTIVE):
        recover(job)
    if IntakeBatchJob.objects.filter(batch__anthology=collection, status__in=ACTIVE).count() >= 2:
        raise Conflict('最多同时分析 2 个收集批次，请等待或停止已有批次')


def start(collection, data):
    """Caller owns collection lock and atomic transaction (QuantView)."""
    fingerprint = digest(['intake-input-v1', data])
    existing = existing_request(collection, data['request_key'], fingerprint)
    if existing:
        return existing
    if data['analyze']:
        check_capacity(collection)
    sources = []
    for ordinal, material in enumerate(data['items'], 1):
        key = digest(['intake-material-v1', collection.pk, data['request_key'], ordinal])[:40]
        entry, _ = collect(collection, {**material, 'request_key': key, 'analyze': False})
        sources.append(entry.pk)  # collect fixes entry and initial source to the same identity.
    return create_batch(collection, data, fingerprint, sources)


def retry(batch, data):
    fingerprint = digest(['intake-retry-v1', batch.pk, data])
    existing = existing_request(batch.anthology, data['request_key'], fingerprint)
    if existing:
        return existing
    job = IntakeBatchJob.objects.filter(batch=batch).first()
    if job and recover(job).status in ACTIVE:
        raise Conflict('批次仍在运行，请结束后重试未完成资料')
    if IntakeBatch.objects.filter(anthology=batch.anthology, plan__parent_id=batch.pk).exists():
        raise Conflict('本批已有重试记录，请从最新的重试批次继续')
    from quant.worker import recover as recover_run
    steps = list(batch.dispatches.select_related('run'))
    for step in steps:
        if step.run and recover_run(step.run).status in ACTIVE:
            raise Conflict('已有分析仍在运行，请结束后重试')
    done = {step.ordinal for step in steps if step.run and step.run.status == 'completed'}
    sources = [source for ordinal, source in enumerate(batch.plan['sources'], 1) if ordinal not in done]
    if not sources:
        raise ValidationError('本批资料已全部完成，无需重试')
    if SourceRevision.objects.filter(pk__in=sources, material__entry__anthology=batch.anthology,
                                    material__entry__is_valid=True).count() != len(sources):
        raise ValidationError('部分未完成资料已删除，请恢复资料后重试')
    check_capacity(batch.anthology)
    return create_batch(batch.anthology, data, fingerprint, sources, batch.pk)


def cancel(batch):
    job = IntakeBatchJob.objects.filter(batch=batch).first()
    if job and recover(job).status in ACTIVE:
        finish(batch, 'cancelled')
