"""Bounded fixed evaluation on the shared CPU pool; no uploaded code execution."""
import time
from datetime import timedelta
from django.conf import settings
from django.db import close_old_connections,transaction
from django.utils import timezone
from quant import queue_liveness
from quant.locking import collection_lock
from quant.models import ValidationJob,ValidationResult
from quant.research.contracts import digest
from quant.experiments.worker import executor
from .services import recover
from .calculation import evaluate
from .usage import audit,universe


def finish(request,status,error='',output=None):
    import json
    published=audit(request.dataset.snapshot,request.data['bounds'],universe(request.plan.anthology.user_id,request.dataset_id,request.pk)) if output else None
    data={'version':1,'status':status,'error':error,'output':output,'publication_audit':published,
        'claim':'fixed_evaluation_observation_not_global_independent_validation'}
    if request.plan.data['version']==2:
        from .criteria import assess
        data.update(version=2,criteria_assessment=assess(request.plan.data['criteria'],status,output,request.data,published))
    if len(json.dumps(data,allow_nan=False))>6_000_000:
        data.update(status='failed',error='固定验证结果超过同步大小上限；未截断账本，登记与数据使用记录保留',output=None,publication_audit=None)
        if data['version']==2:
            data['criteria_assessment']=assess(request.plan.data['criteria'],'failed',None,request.data,None)
    result,_=ValidationResult.objects.get_or_create(id=digest(['validation-result-v1',request.pk])[:40],
        defaults={'request':request,'data':data,'content_hash':digest(data)})
    from quant.verification.services import fixed_validation
    fixed_validation(result)
    return result


def dispatch(job_id):
    if getattr(settings,'QUANT_DISABLE_WORKERS',False): return
    job=ValidationJob.objects.filter(pk=job_id,status='pending').first()
    if not job: return
    lease=queue_liveness.claim(f'validation:{job.pk}',job.lease_token)
    if not lease: return
    try: future=executor.submit(execute,job_id)
    except Exception:
        lease.close()
        with collection_lock(job.request.plan.anthology_id),transaction.atomic():
            job.refresh_from_db()
            if job.status=='pending':
                finish(job.request,'failed','固定验证执行器暂不可用；登记与数据使用记录保留')
                job.status,job.error,job.lease_until='failed','本机执行器暂不可用',None
                job.save(update_fields=['status','error','lease_until','updated_at'])
        return
    future.add_done_callback(lambda _:lease.close())


def execute(job_id):
    close_old_connections(); job,token=None,None
    try:
        job=ValidationJob.objects.select_related('request__dataset','request__plan__anthology').get(pk=job_id)
        collection_id=job.request.plan.anthology_id
        with collection_lock(collection_id),transaction.atomic():
            job.refresh_from_db()
            if recover(job).status!='pending' or job.cancel_requested: return
            token=job.lease_token
            job.status,job.lease_until='running',timezone.now()+timedelta(minutes=3)
            job.save(update_fields=['status','lease_until','updated_at'])
        def authority():
            active=ValidationJob.objects.filter(pk=job_id,lease_token=token,status='running',lease_until__gt=timezone.now(),
                request__plan__anthology__is_valid=True,request__plan__anthology__permission='private',
                request__plan__anthology__type='quant',request__plan__anthology__user_id=job.owner_id).first()
            if not active: raise InterruptedError('固定验证授权已撤销')
            return active
        checked=[-1.]
        def check():
            if time.monotonic()-checked[0]>=.2:
                checked[0]=time.monotonic()
                if authority().cancel_requested: raise InterruptedError('用户停止固定验证')
        output=evaluate(job.request.plan.data,job.request.dataset.snapshot,job.request.data['bounds'],check)
        with collection_lock(collection_id),transaction.atomic():
            active=authority()
            result=finish(job.request,'cancelled' if active.cancel_requested else 'completed',output=None if active.cancel_requested else output)
            active.status,active.lease_until=result.data['status'],None
            active.save(update_fields=['status','lease_until','updated_at'])
            if result.data['status']=='completed':
                from .reviews import automatic
                transaction.on_commit(lambda:automatic(result.pk,token),robust=True)
    except Exception as exc:
        if job and token:
            with collection_lock(job.request.plan.anthology_id),transaction.atomic():
                active=ValidationJob.objects.filter(pk=job_id,lease_token=token,status='running',lease_until__gt=timezone.now(),
                    request__plan__anthology__is_valid=True,request__plan__anthology__permission='private',
                    request__plan__anthology__user_id=job.owner_id).first()
                if active:
                    status='cancelled' if active.cancel_requested else 'failed'
                    error='固定验证达到时间预算；登记和数据使用记录保留' if isinstance(exc,TimeoutError) else '固定验证停止，登记和数据使用记录保留' if status=='cancelled' else '固定验证计算失败；检查数据、表达式和成本约束，原登记与使用记录保留'
                    finish(job.request,status,error)
                    active.status,active.error,active.lease_until=status,error,None
                    active.save(update_fields=['status','error','lease_until','updated_at'])
    finally: close_old_connections()
