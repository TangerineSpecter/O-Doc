"""Revocable local queue; original source never executes in the web process."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections,transaction
from django.utils import timezone
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import NativePythonJob,NativePythonResult
from quant.research.contracts import digest
from .calculation import evaluate,failed
from .services import recover

executor=ThreadPoolExecutor(max_workers=1,thread_name_prefix='quant-native-python')


def active_job(identity,token,status,owner):
    return NativePythonJob.objects.filter(pk=identity,lease_token=token,status=status,owner_id=owner,lease_until__gt=timezone.now(),
        request__anthology__is_valid=True,request__anthology__permission='private',request__anthology__type='quant',
        request__anthology__user_id=owner,request__candidate__report__entry__is_valid=True).first()


def finish(request,data):
    result,_=NativePythonResult.objects.get_or_create(id=digest(['native-python-result-v1',request.pk])[:40],
        defaults={'request':request,'data':data,'content_hash':digest(data)})
    from quant.verification.services import native_python
    native_python(result)
    return result


def dispatch(job_id):
    if getattr(settings,'QUANT_DISABLE_WORKERS',False):return
    job=NativePythonJob.objects.filter(pk=job_id,status='pending').first()
    if not job:return
    if not active_job(job.pk,job.lease_token,'pending',job.owner_id):return
    lease=queue_liveness.claim('native-python:'+job.pk,job.lease_token)
    if not lease:return
    try:future=executor.submit(execute,job_id)
    except Exception:
        lease.close()
        with collection_lock(job.request.anthology_id),transaction.atomic():
            current=active_job(job.pk,job.lease_token,'pending',job.owner_id)
            if current:
                job=current
                finish(job.request,failed('native_execution_failed'))
                job.status,job.error,job.lease_until='failed','本机验证执行器不可用；方案和失败保留',None
                job.save(update_fields=['status','error','lease_until','updated_at'])
                from .feedback import automatic
                result=NativePythonResult.objects.get(request=job.request)
                transaction.on_commit(lambda:automatic(result.pk,job.lease_token),robust=True)
        return
    future.add_done_callback(lambda _:lease.close())


def execute(job_id):
    close_old_connections();job,token=None,None
    try:
        job=NativePythonJob.objects.select_related('request__anthology','request__dataset').get(pk=job_id)
        collection_id=job.request.anthology_id
        with collection_lock(collection_id),transaction.atomic():
            job.refresh_from_db()
            if recover(job).status!='pending' or job.cancel_requested:return
            token=job.lease_token;job.status,job.lease_until='running',timezone.now()+timedelta(minutes=3)
            job.save(update_fields=['status','lease_until','updated_at'])
        def authorized():
            active=active_job(job_id,token,'running',job.owner_id)
            if not active:raise InterruptedError('native_execution_authority_revoked')
            return active
        def check():
            if authorized().cancel_requested:raise InterruptedError('native_execution_cancelled')
        data=evaluate(job.request.plan,job.request.dataset.snapshot,check)
        with collection_lock(collection_id),transaction.atomic():
            active=authorized()
            if active.cancel_requested:data=failed('cancelled','cancelled')
            result=finish(job.request,data)
            active.status,active.error,active.lease_until=data['status'],data['reason'],None
            active.save(update_fields=['status','error','lease_until','updated_at'])
            if data['status']!='cancelled':
                from .feedback import automatic
                transaction.on_commit(lambda:automatic(result.pk,token),robust=True)
    except Exception:
        if job and token:
            with collection_lock(job.request.anthology_id),transaction.atomic():
                active=active_job(job_id,token,'running',job.owner_id)
                if active:
                    data=failed('cancelled','cancelled') if active.cancel_requested else failed('native_execution_failed')
                    result=finish(job.request,data);active.status,active.error,active.lease_until=data['status'],data['reason'],None
                    active.save(update_fields=['status','error','lease_until','updated_at'])
                    if data['status']!='cancelled':
                        from .feedback import automatic
                        transaction.on_commit(lambda:automatic(result.pk,token),robust=True)
    finally:close_old_connections()
