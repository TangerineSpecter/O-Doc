"""One source at a time; capacity waits do not consume an analysis attempt."""
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections, transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import IntakeBatchJob, IntakeDispatch, SourceRevision
from quant.research.contracts import digest
from quant.services import queue, QueueCapacity, ModelUnavailable, Conflict, model_config
from .contracts import ACTIVE
from .services import finish, recover

logger = logging.getLogger(__name__)
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='quant-intake')


def authorized(identity, token):
    job = IntakeBatchJob.objects.select_related('batch__anthology').filter(
        pk=identity, lease_token=token, status__in=ACTIVE, batch__anthology__is_valid=True,
        batch__anthology__permission='private', batch__anthology__type='quant').first()
    if not job or str(job.owner_id) != str(job.batch.anthology.user_id):
        return None
    return job


def dispatch(identity):
    if getattr(settings, 'QUANT_DISABLE_WORKERS', False):
        return
    job = IntakeBatchJob.objects.select_related('batch').filter(pk=identity, status='pending').first()
    if not job:
        return
    lease = queue_liveness.claim(f'intake:{job.pk}', job.lease_token)
    if not lease:
        return
    try:
        future = executor.submit(execute, job.pk, job.lease_token)
    except Exception:
        lease.close()
        logger.exception('Unable to submit quant intake coordinator %s', identity)
        with collection_lock(job.batch.anthology_id), transaction.atomic():
            current = authorized(identity, job.lease_token)
            if current:
                finish(current.batch, 'executor_failed')
        return
    future.add_done_callback(lambda _: lease.close())


def advance(identity, token):
    from quant.worker import recover as recover_run
    initial = authorized(identity, token)
    if not initial:
        return False
    with collection_lock(initial.batch.anthology_id), transaction.atomic():
        job = authorized(identity, token)
        if not job or recover(job).status not in ACTIVE:
            return False
        job.status, job.lease_until = 'running', timezone.now() + timedelta(minutes=3)
        job.save(update_fields=['status', 'lease_until', 'updated_at'])
        batch = job.batch
        steps = list(batch.dispatches.select_related('run'))
        if steps and steps[-1].run and recover_run(steps[-1].run).status in ACTIVE:
            return True
        if len(steps) == len(batch.plan['sources']):
            finish(batch, 'completed')
            return False
        ordinal = len(steps) + 1
        source = SourceRevision.objects.select_related('material__entry').filter(
            pk=batch.plan['sources'][ordinal - 1], material__entry__anthology=batch.anthology,
            material__entry__is_valid=True).first()
        run, reason = None, 'source_unavailable'
        if source:
            try:
                model_config(batch.plan['model_id'])
            except (ModelUnavailable, ValidationError):
                finish(batch, 'waiting_model')
                return False
            try:
                run = queue(source.material.entry, {'kind': 'analyze', 'source_id': source.pk,
                    'model_id': batch.plan['model_id'], 'request_key': digest(['intake-analysis-v1', batch.pk, ordinal])[:40]})
                reason = ''
            except QueueCapacity:
                return True
            except ModelUnavailable:
                finish(batch, 'waiting_model')
                return False
            except (ValidationError, Conflict, Http404):
                reason = 'invalid_input'
        IntakeDispatch.objects.create(id=digest(['intake-dispatch-v1', batch.pk, ordinal])[:40],
            batch=batch, ordinal=ordinal, run=run, reason=reason)
        return True


def execute(identity, token):
    close_old_connections()
    try:
        while advance(identity, token):
            time.sleep(1)
    except Exception:
        logger.exception('Quant intake coordinator interrupted %s', identity)
        job = authorized(identity, token)
        if job:
            with collection_lock(job.batch.anthology_id), transaction.atomic():
                current = authorized(identity, token)
                if current:
                    finish(current.batch, 'interrupted')
    finally:
        close_old_connections()
