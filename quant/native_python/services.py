"""Owner-scoped source verification requests; replay never grants execution."""
from datetime import timedelta
import json
import re
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from quant.locking import collection_lock
from quant.models import NativePythonRequest,NativePythonJob,SourceRevision,FactorCandidate,MarketDataset
from quant.research.contracts import digest
from quant.services import Conflict
from .contracts import build
from . import runtime


def available(collection):
    owner=collection.user_id
    collection.refresh_from_db()
    if collection.user_id!=owner or not collection.is_valid or collection.type!='quant' or collection.permission!='private':
        raise ValidationError('原始Python验证只用于自己的有效私密量化文集')


def inputs(collection,factor_id,values):
    available(collection)
    candidate=get_object_or_404(FactorCandidate.objects.select_related('report__source','report__entry'),pk=factor_id,
        report__entry__anthology=collection,report__entry__is_valid=True)
    source=get_object_or_404(SourceRevision,pk=values.get('source_id') or candidate.report.source_id,material__entry=candidate.report.entry)
    if source.pk!=candidate.report.source_id:
        raise ValidationError('须使用该候选报告固定的来源；新源码须先重新分析生成候选')
    dataset=get_object_or_404(MarketDataset,pk=values['dataset_id'],anthology=collection)
    return candidate,source,dataset


def recover(job):
    if job.status in ('pending','running') and (not job.lease_until or job.lease_until<=timezone.now()):
        from quant import queue_liveness
        if job.status=='pending' and queue_liveness.alive('native-python:'+job.pk,job.lease_token):return job
        job.status,job.error,job.lease_until='interrupted','本机验证已中断；原方案保留，不自动重跑上传代码',None
        job.save(update_fields=['status','error','lease_until','updated_at'])
    return job


def start(collection,factor_id,values):
    key=values['request_key']
    with collection_lock(collection.pk),transaction.atomic():
        candidate,source,dataset=inputs(collection,factor_id,values)
        old=NativePythonRequest.objects.filter(anthology=collection,request_key=key).first()
        if old:
            plan=build(candidate,source,dataset,values,old.plan['environment'])
            if old.candidate_id!=candidate.pk or digest(plan)!=old.content_hash:raise Conflict('验证标识已用于其他源码、参数或片段')
            return old
        build(candidate,source,dataset,values,{})
        fingerprints=(candidate.content_hash,source.content_hash,dataset.content_hash)
    # Only the trusted runner is probed; no source is executed while holding a DB lock.
    environment=runtime.probe()
    with collection_lock(collection.pk),transaction.atomic():
        candidate,source,dataset=inputs(collection,factor_id,values)
        if fingerprints!=(candidate.content_hash,source.content_hash,dataset.content_hash):raise Conflict('准备验证期间来源或行情已改变，请刷新后重试')
        plan=build(candidate,source,dataset,values,environment)
        old=NativePythonRequest.objects.filter(anthology=collection,request_key=key).first()
        if old:
            if old.content_hash!=digest(plan):raise Conflict('验证标识已用于其他方案')
            return old
        active=[recover(job) for job in NativePythonJob.objects.filter(status__in=('pending','running'))]
        if sum(job.status in ('pending','running') for job in active)>=4:raise Conflict('本机最多保留4份原始Python验证任务')
        request=NativePythonRequest.objects.create(id=digest(['native-python-request-v1',collection.pk,key])[:40],
            anthology=collection,candidate=candidate,source=source,dataset=dataset,request_key=key,plan=plan,content_hash=digest(plan))
        job=NativePythonJob.objects.create(request=request,owner_id=collection.user_id,model_id=values['model_id'],
            lease_until=timezone.now()+timedelta(minutes=3))
        from .worker import dispatch
        transaction.on_commit(lambda:dispatch(job.pk))
        return request


def presentation(request,detail=False):
    job=NativePythonJob.objects.filter(request=request).first();job=recover(job) if job else None
    result=getattr(request,'result',None)
    value={'id':request.pk,'candidate_id':request.candidate_id,'name':request.plan['name'],'created_at':request.created_at,
        'status':result.data['status'] if result else job.status if job else 'interrupted',
        'cancel_requested':job.cancel_requested if job else False,'error':job.error if job else '',
        'verdict':result.data['comparison']['status'] if result and result.data['comparison'] else None,'content_hash':request.content_hash}
    if detail:
        value.update(plan_json=json.dumps(request.plan,ensure_ascii=False,allow_nan=False),
            result_json=json.dumps(result.data,ensure_ascii=False,allow_nan=False) if result else None)
        from .feedback import presentation as feedback_presentation
        value['analysis']=feedback_presentation(result) if result else None
    return value


def options(collection,factor_id):
    candidate=get_object_or_404(FactorCandidate.objects.select_related('report__source'),pk=factor_id,
        report__entry__anthology=collection,report__entry__is_valid=True)
    source=candidate.report.source
    from .contracts import source_files,signature_hints
    try:
        files=source_files(source.payload);primary=next(row for row in files if row['role']=='primary')
        names=list(dict.fromkeys(re.findall(r'^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(',primary['text'],flags=re.MULTILINE)))[:40]
        source_info={'id':source.pk,'content_hash':source.content_hash,'files':[row['path'] for row in files],
            'entrypoints':names,'signatures':signature_hints(primary['text']),'text_encoding':'utf-8',
            'note':'签名扫描不求值；隔离验证会执行原模块初始化，全部函数参数仍需显式映射。原文件二进制编码未认证'}
    except ValidationError:source_info=None
    try:environment=runtime.probe();runner={'available':True,'environment_json':json.dumps(environment,ensure_ascii=False),'reason':''}
    except runtime.RuntimeUnavailable as error:runner={'available':False,'environment_json':None,'reason':str(error)}
    return {'source':source_info,'runner':runner,'supported':'generic_python_function_fixed_sample',
        'other_platforms':[{'platform':name,'available':False,'reason':'native_runner_not_configured'} for name in ('pine','mql4','tongdaxin','jqdata')]}
