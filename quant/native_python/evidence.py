"""Bounded direct facts for UI and AI; no vectors or performance claims."""
import copy
from quant.research.contracts import digest


def summary(identity,plan,data,result_hash,snapshot):
    comparison=data.get('comparison')
    start=plan['dataset']['offset'];size=plan['dataset']['row_count'];sample=snapshot['rows'][start:start+size]
    return {'version':1,'id':identity,'content_hash':result_hash,'method':data['method'],
        'candidate_id':plan['candidate']['id'],'candidate_hash':plan['candidate']['hash'],
        'source':{key:copy.deepcopy(plan['source'][key]) for key in ('id','hash','main')}|{
            'files':[{key:row[key] for key in ('path','role','sha256')} for row in plan['source']['files']],
            'text_encoding':'utf-8','original_binary_encoding_attested':False},
        'dataset':copy.deepcopy(plan['dataset'])|{'sample_hash':digest(sample),'start':sample[0]['timestamp'],'end':sample[-1]['timestamp'],
            'market':{key:snapshot.get(key) for key in ('symbol','timeframe','timezone','source','price_adjustment')}},
        'parameters':copy.deepcopy(plan['candidate']['parameters']),'bindings':copy.deepcopy(plan['candidate']['bindings']),
        'native':copy.deepcopy(plan['native']),'policy':copy.deepcopy(plan['policy']),'environment':copy.deepcopy(plan['environment']),
        'status':data['status'],'reason':data['reason'],'verdict':comparison['status'] if comparison else None,
        'comparison':copy.deepcopy(comparison),'independent_validation':False,'platform_equivalence':'unverified',
        'economic_effectiveness':'unassessed','claim':data['claim']}


def for_result(result):
    return summary(result.pk,result.request.plan,result.data,result.content_hash,result.request.dataset.snapshot)


def from_rows(reference,payload,rows,fail):
    result=rows.get('quant.nativepythonresult',{}).get(reference['id'],{})
    request=rows.get('quant.nativepythonrequest',{}).get(result.get('request'),{})
    if (not result or result['content_hash']!=reference['content_hash'] or request.get('candidate')!=payload['factor_id']
            or request.get('source')!=payload['target_source_id']):fail('Python反馈引用缺少原验证或固定来源')
    value=summary(reference['id'],request['plan'],result['data'],result['content_hash'],rows['quant.marketdataset'][request['dataset']]['snapshot'])
    from .feedback import document
    if payload['document']!=document(value):fail('Python验证反馈摘要与原事实不一致')
    return value


def linked_summary(payload):
    from rest_framework.exceptions import ValidationError
    from quant.models import NativePythonResult
    from .feedback import document
    result=NativePythonResult.objects.select_related('request__dataset').filter(pk=payload['native_check']['id'],
        content_hash=payload['native_check']['content_hash'],request__candidate_id=payload['factor_id'],request__source_id=payload['target_source_id']).first()
    if not result:raise ValidationError('Python验证反馈缺少原始计算事实')
    value=for_result(result)
    if payload['document']!=document(value):raise ValidationError('Python验证反馈摘要与原事实不一致')
    return value


def verification(candidate_id,candidate,identity,plan,data,result_hash,snapshot):
    if candidate_id!=plan['candidate']['id'] or digest(candidate)!=plan['candidate']['hash']:return None
    value=summary(identity,plan,data,result_hash,snapshot)
    return value|{'kind':'native_python','candidate_hash':digest(candidate),'target_id':identity,'target_hash':result_hash,
        'scope':'original_python_function_and_explicit_arguments_fixed_sample',
        'levels':(['native_python_fixed_observation']+(['native_python_fixed_match'] if value['verdict']=='pass' else [])) if data['status']=='completed' else []}
