"""Bounded local indexing; no model request is performed by a read endpoint."""
from quant.admissions.services import compact_prefetch as admission_prefetch
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.locking import collection_lock
from quant.models import FactorCandidate, FactorIndexJob, FactorVector, ResearchReport
from quant.services import Conflict
from quant import queue_liveness
from utils.rag_client import RagClient
from .projection import projection


def candidates(collection):
    return FactorCandidate.objects.filter(report__entry__anthology=collection, report__entry__is_valid=True).select_related(
        'report__entry', 'report__run').prefetch_related('revisions', 'report__source', 'qualifications', admission_prefetch()).defer('report__data', 'report__markdown')


def embedding_model():
    model = RagClient.get_embedding_model()
    if model and model.type == 'embedding':
        return model
    return None


def recover(job: FactorIndexJob) -> FactorIndexJob:
    if job.status in ('pending', 'running') and (not job.lease_until or job.lease_until < timezone.now()):
        if job.status == 'pending' and queue_liveness.alive(f'index:{job.pk}', job.lease_token):
            return job
        job.status, job.error, job.lease_until = 'interrupted', '本机索引任务中断，可手动继续；不会自动恢复执行', None
        job.save(update_fields=['status', 'error', 'lease_until', 'updated_at'])
    return job


def queue_index(collection, *, candidate_ids: list[str] | None = None, automatic=False) -> FactorIndexJob | None:
    from .worker import dispatch
    with collection_lock(collection.pk), transaction.atomic():
        collection.refresh_from_db()
        if not collection.is_valid or collection.type != 'quant' or collection.permission != 'private':
            raise ValidationError('量化文集已不可用')
        model = embedding_model()
        if not model:
            if automatic:
                return None
            raise ValidationError('请先在系统设置配置默认向量模型')
        active = [recover(job) for job in FactorIndexJob.objects.filter(anthology=collection, status__in=['pending', 'running'])]
        signature = RagClient.embedding_model_signature(model)
        pending = candidates(collection)
        if candidate_ids is not None:
            pending = pending.filter(pk__in=candidate_ids)
        cached = {row.candidate_id: row for row in FactorVector.objects.filter(candidate__report__entry__anthology=collection, model_signature=signature).only('candidate_id', 'projection_hash')}
        reserved = {identity for job in active if job.status in ('pending', 'running') and job.model_signature == signature for identity in job.candidate_ids}
        selected = []
        for candidate in pending:
            try:
                _, content_hash = projection(candidate)
            except ValueError:
                continue
            previous = cached.get(candidate.pk)
            if previous and previous.projection_hash == content_hash:
                continue
            if candidate.pk in reserved:
                continue
            selected.append(candidate.pk)
            if len(selected) >= 50:
                break
        if not selected:
            return None
        if sum(job.status in ('pending', 'running') for job in active) >= 4:
            if automatic:
                return None
            raise Conflict('当前已有索引任务，请等待完成或取消后重试')
        job = FactorIndexJob.objects.create(anthology=collection, owner_id=collection.user_id,
            candidate_ids=selected, model_id=model.pk, model_signature=signature, model_name=model.name,
            lease_until=timezone.now() + timedelta(minutes=3))
        transaction.on_commit(lambda: dispatch(job.pk))
        return job


def auto_index(report_id: str) -> None:
    import logging
    try:
        report = ResearchReport.objects.select_related('entry__anthology').get(pk=report_id)
        queue_index(report.entry.anthology, candidate_ids=list(report.factor_candidates.values_list('id', flat=True)), automatic=True)
    except Exception as exc:
        # Analysis has already committed. A missing/unavailable optional index
        # never erases that report; graph status exposes uncached candidates.
        logging.getLogger(__name__).warning('Quant auto index unavailable report=%s type=%s', report_id, type(exc).__name__)


def job_data(job: FactorIndexJob) -> dict:
    return {'id': job.pk, 'status': job.status, 'total': len(job.candidate_ids), 'processed': job.processed,
        'model_name': job.model_name, 'error': job.error, 'created_at': job.created_at.isoformat()}


def index_status(collection) -> dict:
    model = embedding_model()
    signature = RagClient.embedding_model_signature(model) if model else ''
    cached = {row.candidate_id: row for row in FactorVector.objects.filter(candidate__report__entry__anthology=collection, model_signature=signature).only('candidate_id', 'projection_hash')}
    ready, total, oversized = 0, 0, 0
    for candidate in candidates(collection):
        total += 1
        try:
            _, fingerprint = projection(candidate)
        except ValueError:
            oversized += 1
            continue
        vector = cached.get(candidate.pk)
        ready += bool(vector and vector.projection_hash == fingerprint)
    jobs = [job_data(recover(job)) for job in FactorIndexJob.objects.filter(anthology=collection).order_by('-created_at')[:8]]
    return {'configured': bool(model), 'model_name': model.name if model else '', 'model_signature': signature,
        'total': total, 'ready': ready, 'missing': total - ready - oversized, 'oversized': oversized,
        'batch_limit': 50, 'jobs': jobs}
