"""Publish after revocable calculation authority is rechecked; reads do no work."""
from quant.models import SelectionDiagnostic
from quant.research.contracts import digest


def archive(result,computed):
    if result.data['status'] not in ('completed','partial'):return None
    data={**computed,'binding':{'request_id':result.request_id,'request_hash':result.request.content_hash,
        'result_id':result.pk,'result_hash':result.content_hash,'dataset_hash':result.request.plan['dataset_hash']}}
    record,_=SelectionDiagnostic.objects.get_or_create(id=digest(['selection-diagnostic-v1',result.pk])[:40],
        defaults={'result':result,'data':data,'content_hash':digest(data)})
    return record


def reference(result):
    record=SelectionDiagnostic.objects.filter(result=result).first()
    return {'id':record.pk,'content_hash':record.content_hash} if record else None


def from_reference(result,reference):
    if reference is None:return None
    record=SelectionDiagnostic.objects.filter(result=result,pk=reference.get('id'),content_hash=reference.get('content_hash')).first()
    if not record:raise ValueError('Selection diagnostic reference mismatch')
    return record.data


def presentation(result):
    import json
    record=SelectionDiagnostic.objects.filter(result=result).first() if result else None
    return {'id':record.pk,'content_hash':record.content_hash,'created_at':record.created_at,
        'data_json':json.dumps(record.data,ensure_ascii=False,allow_nan=False)} if record else None
