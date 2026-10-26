"""Archive a deterministic native summary, then use the existing AI report flow."""
import json
from django.db import transaction
from django.db.models import Prefetch
from quant.locking import collection_lock
from quant.models import NativePythonJob,NativePythonResult,SourceRevision,AIRun,ResearchReport,WorkflowStep
from quant.research.contracts import digest
from .evidence import for_result


def document(value):
    return json.dumps({'kind':'original_python_fixed_sample','facts':value,
        'boundary':'这是一份固定Python函数输出对照；没有收益、回测、最优参数或平台全局等价证明。'},ensure_ascii=False,sort_keys=True,allow_nan=False)


def automatic(result_id,token):
    result=NativePythonResult.objects.select_related('request__anthology','request__candidate__report__entry','request__dataset').get(pk=result_id)
    request=result.request
    with collection_lock(request.anthology_id),transaction.atomic():
        job=NativePythonJob.objects.filter(request=request,lease_token=token,status__in=('completed','failed'),
            request__anthology__is_valid=True,request__anthology__permission='private',request__anthology__type='quant',
            request__anthology__user_id=request.anthology.user_id,request__candidate__report__entry__is_valid=True).first()
        if not job or job.owner_id!=request.anthology.user_id or not request.plan['analyze']:return
        from quant.feedback.services import collect
        reference={'id':result.pk,'content_hash':result.content_hash}
        collect(request.candidate.report.entry,{'request_key':digest(['native-python-ai-review',result.pk])[:40],
            'title':request.plan['name']+' · Python原始函数验证解读','target_source_id':request.source_id,
            'factor_id':request.candidate_id,'mode':'unknown','document_format':'json','document':document(for_result(result)),
            'platform':'generic Python 3.11 fixed sample','analyze':True,'model_id':job.model_id},native_check=reference)


def presentation(result):
    source=SourceRevision.objects.filter(payload__feedback_version=4,payload__native_check__id=result.pk,
        material__entry=result.request.candidate.report.entry).order_by('created_at','id').first()
    if not source:return None
    query=AIRun.objects.filter(source=source,kind='feedback_review').order_by('-created_at','-id').prefetch_related(
        Prefetch('workflow_steps',queryset=WorkflowStep.objects.select_related('outcome').order_by('ordinal'),to_attr='_native_audit_steps'))
    from quant.worker import recover
    recent=[recover(row) for row in query[:11]];run=recent[0] if recent else None
    report=ResearchReport.objects.filter(run=run).first() if run else None
    previous=ResearchReport.objects.filter(source=source).order_by('-created_at','-id').first()
    from quant.native_reviews.presentation import summary as audit_summary
    historical_reports=dict(ResearchReport.objects.filter(run__in=recent[1:]).values_list('run_id','id'))
    return {'source_id':source.pk,'entry_id':source.material.entry_id,'run_id':run.pk if run else None,
        'status':run.status if run else 'not_queued','error':run.error if run else '原始事实已归档；请配置可用对话模型后在来源研究中发起解读',
        'report_id':report.pk if report else None,'previous_report_id':previous.pk if previous and not report else None,
        'audit':audit_summary(run) if run else None,
        'history_total':max(0,query.count()-1),'history':[{'run_id':row.pk,'status':row.status,'error':row.error,
            'created_at':row.created_at,'model_name':row.model_name,'report_id':historical_reports.get(row.pk),
            'audit':audit_summary(row)} for row in recent[1:]]}
