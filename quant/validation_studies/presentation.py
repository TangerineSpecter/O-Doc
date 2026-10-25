"""Transport arbitrary formula/parameter keys inside JSON strings."""
import json
from django.core.exceptions import ObjectDoesNotExist
from quant.models import ValidationJob,ValidationResult,AIRun
from .services import recover,preview


def data(plan,detail=True):
    value={'id':plan.pk,'name':plan.data['name'],'source_request_id':plan.source_request_id,
        'created_at':plan.created_at.isoformat(),'content_hash':plan.content_hash,'plan_json':json.dumps(plan.data,ensure_ascii=False),
        'evaluation':None}
    try: request=plan.evaluation
    except ObjectDoesNotExist: return value
    job=ValidationJob.objects.filter(request=request).first()
    if job: recover(job)
    result=ValidationResult.objects.filter(request=request).first()
    evaluation={'id':request.pk,'dataset_id':request.dataset_id,'mode':request.data['mode'],
        'status':result.data['status'] if result else job.status if job else 'interrupted',
        'error':job.error if job else '' if result else '此设备没有本次执行权限；已预约数据仍计为使用',
        'cancel_requested':bool(job and job.cancel_requested),'request_json':json.dumps(request.data,ensure_ascii=False),
        'result_id':result.pk if result else None,'result_json':json.dumps(result.data,ensure_ascii=False) if result else None}
    if detail:
        evaluation['current_audit_json']=json.dumps(preview(plan,request.dataset,request.pk)['audit'],ensure_ascii=False)
        from quant.presentation import run_data
        from quant.research.presentation import report_data
        from quant.worker import recover as recover_review
        reviews=list(AIRun.objects.filter(validation_result=result).select_related('report').prefetch_related('report__revisions')[:10]) if result else []
        for run in reviews: recover_review(run)
        evaluation['reviews']=[{'run':run_data(run),'report':report_data(run.report) if hasattr(run,'report') else None} for run in reviews]
    value['evaluation']=evaluation
    return value


def list_data(plans,offset=0):
    """List summaries never load frozen audit manifests, recipes or full trade ledgers."""
    from django.db.models import F
    from quant.models import ValidationRequest
    records=list(plans.annotate(summary_name=F('data__name')).values('id','source_request_id','created_at','content_hash','summary_name')[offset:offset+20])
    evaluations=list(ValidationRequest.objects.filter(plan_id__in=[r['id'] for r in records]).annotate(
        mode=F('data__mode'),result_status=F('result__data__status')).values('id','plan_id','dataset_id','mode','result_status'))
    jobs={job.request_id:recover(job) for job in ValidationJob.objects.filter(request_id__in=[r['id'] for r in evaluations])}
    mapping={r['plan_id']:r for r in evaluations}
    result=[]
    for row in records:
        record={'id':row['id'],'name':row['summary_name'],'source_request_id':row['source_request_id'],
            'created_at':row['created_at'].isoformat(),'content_hash':row['content_hash'],'evaluation':None}
        item=mapping.get(row['id'])
        if item:
            job=jobs.get(item['id'])
            record['evaluation']={'id':item['id'],'dataset_id':item['dataset_id'],'mode':item['mode'],
                'status':item['result_status'] or (job.status if job else 'interrupted')}
        result.append(record)
    return result
