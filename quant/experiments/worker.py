"""No uploaded script execution. Bounded local expression jobs, revocable at publish."""
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections, transaction
from django.utils import timezone
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import ExperimentJob, ExperimentCheckpoint
from quant.research.contracts import digest
from .jobs import recover
from .outcomes import finish
from .search import run_batch

executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-experiment')


def dispatch(job_id: str) -> None:
    if getattr(settings, 'QUANT_DISABLE_WORKERS', False):
        return
    job = ExperimentJob.objects.filter(pk=job_id, status='pending').first()
    if not job:
        return
    lease = queue_liveness.claim(f'experiment:{job.pk}', job.lease_token)
    if not lease:
        return
    try:
        future = executor.submit(execute, job_id)
    except Exception:
        lease.close()
        with collection_lock(job.request.anthology_id), transaction.atomic():
            job.refresh_from_db()
            if job.status == 'pending':
                job.status, job.error, job.lease_until = 'failed', '本机实验执行器暂不可用；方案保留，可新建实验重试', None
                finish(job.request, 'failed', error=job.error)
                job.save(update_fields=['status', 'error', 'lease_until', 'updated_at'])
        return
    future.add_done_callback(lambda _future: lease.close())


def execute(job_id: str) -> None:
    close_old_connections()
    token, job = None, None
    try:
        job = ExperimentJob.objects.select_related('request__dataset', 'request__anthology').get(pk=job_id)
        collection_id = job.request.anthology_id
        with collection_lock(collection_id), transaction.atomic():
            job.refresh_from_db()
            if recover(job).status != 'pending' or job.cancel_requested:
                return
            token = job.lease_token
            job.status, job.lease_until = 'running', timezone.now() + timedelta(minutes=3)
            job.save(update_fields=['status', 'lease_until', 'updated_at'])
        def authorization():
            active = ExperimentJob.objects.filter(pk=job_id, lease_token=token, status='running', lease_until__gt=timezone.now(),
                request__anthology__is_valid=True, request__anthology__permission='private',
                request__anthology__type='quant', request__anthology__user_id=job.owner_id).first()
            if not active:
                raise InterruptedError('本机执行授权已撤销')
            return active
        last_check = [-1.]
        def check():
            now = time.monotonic()
            if now - last_check[0] >= .2:
                last_check[0] = now
                if authorization().cancel_requested:
                    raise InterruptedError('用户停止实验')
        def checkpoint(attempt):
            with collection_lock(collection_id), transaction.atomic():
                authorization()  # Cancel may save partial facts; restore/revocation cannot.
                ordinal = int(attempt['id'].split('-')[-1])
                ExperimentCheckpoint.objects.get_or_create(id=digest(['experiment-checkpoint-v1', job.request_id, ordinal])[:40],
                    defaults={'request_id': job.request_id, 'ordinal': ordinal, 'attempt': attempt, 'content_hash': digest(attempt)})
        calculation_started=time.monotonic()
        output = run_batch(job.request.dataset.snapshot, job.request.plan['seeds'], job.request.plan['config'], check=check, checkpoint=checkpoint, engine_version=job.request.plan['engine_version'])
        from quant.search_diagnostics.calculation import compute as selection_diagnostic
        diagnostic=selection_diagnostic(job.request.plan,job.request.dataset.snapshot,output,check=check,
            seconds=min(10,max(0,job.request.plan['config']['seconds']-(time.monotonic()-calculation_started))))
        if 'strategy' in job.request.plan['config']:
            from quant.strategies.validation import validate_result_size
            validate_result_size(output)
        with collection_lock(collection_id), transaction.atomic():
            active = authorization()
            # Cancellation after the final computation still takes precedence.
            status = 'cancelled' if active.cancel_requested or output['stop_reason'] == 'cancelled' else 'partial' if output['stop_reason'] == 'time_budget' else 'completed'
            if status == 'cancelled':
                output['holdout'], output['buy_hold_baseline'], output['holdout_status'] = None, None, 'not_evaluated'
                output['stop_reason'] = 'cancelled'
                if 'walk_forward' in output:
                    from .temporal import summarize
                    temporal = output['walk_forward']
                    temporal['folds'][-1].update(holdout=None, buy_hold_baseline=None, holdout_status='not_evaluated', stop_reason='cancelled')
                    temporal['summary'] = summarize(temporal['folds'], job.request.plan['config']['walk_forward']['folds'])
            result = finish(job.request, status, output=output)
            from quant.search_diagnostics.services import archive as archive_diagnostic
            archive_diagnostic(result,diagnostic)
            if status == 'completed':
                from .derivation import publish_derived, auto_index_derived
                publish_derived(result)
                from quant.verification.services import experiment as archive_verification
                archive_verification(result)
                transaction.on_commit(lambda: auto_index_derived(result.pk, token), robust=True)
            if status in ('completed', 'partial'):
                from .reviews import auto_review
                transaction.on_commit(lambda: auto_review(result.pk, token), robust=True)
            active.status, active.lease_until = status, None
            active.save(update_fields=['status', 'lease_until', 'updated_at'])
    except Exception as exc:
        if job and token:
            with collection_lock(job.request.anthology_id), transaction.atomic():
                active = ExperimentJob.objects.filter(pk=job_id, lease_token=token, status='running', lease_until__gt=timezone.now(),
                    request__anthology__is_valid=True, request__anthology__permission='private',
                    request__anthology__type='quant', request__anthology__user_id=job.owner_id).first()
                if active:
                    status = 'cancelled' if active.cancel_requested else 'failed'
                    error = '实验停止，已保存的尝试保留' if status == 'cancelled' else '实验执行失败，已保存的尝试保留；请检查输入与引擎约束'
                    from quant.strategies.validation import LedgerBudgetExceeded
                    if status == 'failed' and isinstance(exc, LedgerBudgetExceeded): error = str(exc)
                    finish(job.request, status, error=error)
                    active.status, active.error, active.lease_until = status, error, None
                    active.save(update_fields=['status', 'error', 'lease_until', 'updated_at'])
    finally:
        close_old_connections()
