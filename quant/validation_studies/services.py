"""Plan registration and one-use local execution grants, under collection locks."""
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.exceptions import ValidationError
from quant.models import ExperimentRequest,MarketDataset,ValidationPlan,ValidationRequest,ValidationJob
from quant.services import Conflict
from quant.research.contracts import digest
from .contracts import build,bounds
from .usage import universe,audit


def register(collection,values):
    request=get_object_or_404(ExperimentRequest.objects.select_related('result','dataset'),pk=values['source_request_id'],anthology=collection)
    try: result=request.result
    except ObjectDoesNotExist as exc: raise ValidationError('来源实验尚无已发布结果') from exc
    data=build(request.plan,result.data,request.dataset.snapshot,request.pk,result.pk,result.content_hash,request.dataset_id,values)
    fingerprint=digest(data)
    existing=ValidationPlan.objects.filter(anthology=collection,request_key=values['request_key']).first()
    if existing:
        if existing.content_hash!=fingerprint: raise Conflict('登记标识已用于不同验证方案')
        return existing
    return ValidationPlan.objects.create(id=digest(['validation-plan-v1',collection.pk,values['request_key']])[:40],anthology=collection,
        source_request=request,request_key=values['request_key'],data=data,content_hash=fingerprint)


def preview(plan,dataset,exclude_request_id=''):
    if dataset.anthology_id!=plan.anthology_id: raise ValidationError('验证行情不属于当前文集')
    limits=bounds(plan.data,dataset.snapshot)
    known=universe(plan.anthology.user_id,dataset.pk,exclude_request_id)
    report=audit(dataset.snapshot,limits,known)
    after_registration=dataset.created_at.replace(microsecond=dataset.created_at.microsecond//1000*1000)>plan.created_at.replace(microsecond=plan.created_at.microsecond//1000*1000)
    return {'bounds':limits,'audit':report,'imported_after_registration':after_registration,
        'fresh_allowed':after_registration and report['complete_scan'] and not report['conflict_count'],
        'claim':'registration_before_binding_and_tracked_range_only_external_use_unattested'}


def start(plan,dataset,mode):
    from .worker import dispatch
    if mode not in ('fresh','replication'): raise ValidationError('请选择新数据验证或普通复核')
    if dataset.anthology_id!=plan.anthology_id: raise ValidationError('验证行情不属于当前文集')
    existing=ValidationRequest.objects.filter(plan=plan).first()
    if existing:
        if existing.dataset_id!=dataset.pk or existing.data['mode']!=mode: raise Conflict('此计划已绑定行情；停止或失败也不会清除使用记录，请登记新计划')
        return existing
    prepared=preview(plan,dataset)
    if mode=='fresh' and not prepared['fresh_allowed']:
        raise ValidationError('当前不满足登记后导入且无已知重用的条件；核对审计、导入新数据，或明确改为普通复核')
    active=ValidationJob.objects.filter(request__plan__anthology=plan.anthology,status__in=('pending','running'))
    if sum(recover(job).status in ('pending','running') for job in active)>=4: raise Conflict('最多同时保留4个固定验证')
    data={'version':1,'plan_hash':plan.content_hash,'dataset_hash':dataset.content_hash,'mode':mode,**prepared}
    request=ValidationRequest.objects.create(id=digest(['validation-request-v1',plan.pk])[:40],plan=plan,dataset=dataset,data=data,content_hash=digest(data))
    job=ValidationJob.objects.create(request=request,owner_id=plan.anthology.user_id,lease_until=timezone.now()+timedelta(minutes=3))
    transaction.on_commit(lambda:dispatch(job.pk))
    return request


def recover(job):
    from quant import queue_liveness
    if job.status in ('pending','running') and (not job.lease_until or job.lease_until<=timezone.now()):
        if job.status=='pending' and queue_liveness.alive(f'validation:{job.pk}',job.lease_token): return job
        job.status,job.error,job.lease_until='interrupted','本机固定验证中断；恢复不会自动授权或把数据重新当作未使用',None
        job.save(update_fields=['status','error','lease_until','updated_at'])
    return job


def cancel(request):
    job=ValidationJob.objects.filter(request=request).first()
    if job and recover(job).status in ('pending','running'):
        job.cancel_requested=True
        if job.status=='pending':
            from .worker import finish
            finish(request,'cancelled','固定验证在计算前停止；数据预约仍保留')
            job.status,job.lease_until='cancelled',None
        job.save(update_fields=['cancel_requested','status','lease_until','updated_at'])
