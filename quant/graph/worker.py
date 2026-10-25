"""Local revocable embedding work, bounded by 50 candidates and 300 seconds per job."""
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import FactorIndexJob, FactorVector
from utils.ai_observer import observe_ai
from utils.ai_service import AIService
from utils.bounded_embeddings import embed_texts
from utils.rag_client import RagClient
from utils.token_usage import usage_scope
from .indexing import candidates, embedding_model, recover
from .projection import cosine, projection
from .relations import connect_semantic

executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-index')


def dispatch(job_id: str) -> None:
    if getattr(settings, 'QUANT_DISABLE_WORKERS', False):
        return
    job = FactorIndexJob.objects.filter(pk=job_id, status='pending').first()
    if not job:
        return
    lease = queue_liveness.claim(f'index:{job.pk}', job.lease_token)
    if lease is None:
        return
    try:
        future = executor.submit(execute, job_id)
    except BaseException:
        lease.close()
        raise
    future.add_done_callback(lambda _future: lease.close())


def execute(job_id: str) -> None:
    close_old_connections()
    token = None
    try:
        job = FactorIndexJob.objects.get(pk=job_id)
        with collection_lock(job.anthology_id), transaction.atomic():
            job = FactorIndexJob.objects.select_related('anthology').get(pk=job_id)
            if recover(job).status != 'pending':
                return
            token = job.lease_token
            job.status = 'running'
            job.lease_until = timezone.now() + timedelta(minutes=3)
            job.save(update_fields=['status', 'lease_until', 'updated_at'])
        started = time.monotonic()

        def check():
            if time.monotonic() - started > 300:
                raise TimeoutError('本次索引已到达300秒预算')
            if not FactorIndexJob.objects.filter(pk=job_id, lease_token=token, status='running',
                lease_until__gt=timezone.now(), anthology__is_valid=True, anthology__type='quant',
                anthology__permission='private', anthology__user_id=job.owner_id).exists():
                raise InterruptedError('索引执行授权已失效')

        def progress(*_args):
            check()
            FactorIndexJob.objects.filter(pk=job_id, lease_token=token, status='running').update(
                lease_until=timezone.now() + timedelta(minutes=3))

        model = embedding_model()
        if not model or model.pk != job.model_id or RagClient.embedding_model_signature(model) != job.model_signature:
            raise ValueError('默认向量模型已改变，请重新建立索引')
        config = AIService.get_client_config_for_model(model.pk)
        for offset, candidate_id in enumerate(job.candidate_ids):
            check()
            current_model = embedding_model()
            if not current_model or RagClient.embedding_model_signature(current_model) != job.model_signature:
                raise InterruptedError('模型配置已变更')
            candidate = candidates(job.anthology).filter(pk=candidate_id).first()
            if candidate:
                text, content_hash = projection(candidate)
                cached = FactorVector.objects.filter(candidate=candidate, projection_hash=content_hash, model_signature=job.model_signature).first()
                if not cached:
                    with usage_scope(owner_id=job.owner_id, record=job, purpose='quant', phase='factor_index'), observe_ai(progress, check):
                        vector = embed_texts([text], model=model, timeout_seconds=30, capture_config=config)[0]
                    if cosine(vector, vector) is None:
                        raise ValueError('向量为空、全零、维度过大或包含无效数值')
                    with collection_lock(job.anthology_id), transaction.atomic():
                        check()
                        current_model = embedding_model()
                        if not current_model or RagClient.embedding_model_signature(current_model) != job.model_signature:
                            raise InterruptedError('模型配置已变更，旧结果未写入')
                        latest = candidates(job.anthology).filter(pk=candidate_id).first()
                        if latest and projection(latest)[1] == content_hash:
                            FactorVector.objects.update_or_create(candidate=latest, defaults={'projection_hash': content_hash,
                                'model_signature': job.model_signature, 'model_name': job.model_name, 'vector': vector})
                            connect_semantic(latest, vector, job.model_signature, job.model_name)
            FactorIndexJob.objects.filter(pk=job_id, lease_token=token, status='running').update(
                processed=offset + 1, lease_until=timezone.now() + timedelta(minutes=3))
        with collection_lock(job.anthology_id), transaction.atomic():
            check()
            FactorIndexJob.objects.filter(pk=job_id, lease_token=token, status='running').update(status='completed', lease_until=None)
    except Exception as exc:
        job = FactorIndexJob.objects.filter(pk=job_id).first()
        if job and token:
            with collection_lock(job.anthology_id), transaction.atomic():
                FactorIndexJob.objects.filter(pk=job_id, lease_token=token, status='running').update(
                    status='interrupted' if isinstance(exc, InterruptedError) else 'failed', lease_until=None,
                    error='索引已中断或模型/材料改变，可重新建立剩余索引' if isinstance(exc, InterruptedError)
                        else '向量模型请求失败、超时或输出无效；已有索引保留，可重试剩余候选')
    finally:
        close_old_connections()
