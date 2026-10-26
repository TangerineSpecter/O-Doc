"""Bounded fixed-validation facts for AI; no raw prices or full audit manifests."""
from quant.experiments.review_evidence import metric_evidence


def audit_summary(value):
    result={key:value[key] for key in ('scope','complete_scan','totals','conflict_count','range_status',
        'external_prior_use','global_independent_validation','limitations')}
    if value['version']==2:
        # Preserve a concrete native-use counterexample before filling the
        # remaining bounded sample; never silently suggest the sample is all.
        conflicts=value['conflicts']
        native=next((row for row in conflicts if row['kind']=='native_python'),None)
        selected=([native] if native else [])+[row for row in conflicts if row is not native]
        selected=selected[:12]
        records={row['key']:row for row in value['manifest']}
        result.update(version=2,conflict_sample=[dict(row,**({'native_sample':records[row['key']]['native_sample']}
            if row['kind']=='native_python' else {})) for row in selected],
            omitted_conflict_count=value['conflict_count']-len(selected))
    return result


def project(plan,request,result):
    output=result['output']
    value={'plan':plan,'mode':request['mode'],'bounds':request['bounds'],
        'imported_after_registration':request['imported_after_registration'],
        'authorization_audit':audit_summary(request['audit']),
        'publication_audit':audit_summary(result['publication_audit']),
        'final':metric_evidence(output['final']),'baseline':metric_evidence(output['baseline']),
        'selection':output['selection'],'independent_validation':False,
        'scope':'one_frozen_formula_one_interval_no_search_not_parameter_stability_proof'}
    if result.get('version')==2:
        value['criteria_assessment']=result['criteria_assessment']
    return value


def for_result(result):
    return project(result.request.plan.data,result.request.data,result.data)


def from_rows(run,rows,fail):
    if run.get('review_version') not in (9,10,11,12,13,14):
        if run.get('validation_result'): fail('历史解读不能追加固定验证引用')
        return None
    if not run.get('validation_result') and run.get('review_version') in (10,11,12,13,14):
        if run.get('planning_context',{}).get('fixed_validation') is not None: fail('普通解读不可夹带固定验证上下文')
        return None
    result=rows.get('quant.validationresult',{}).get(str(run.get('validation_result')), {})
    request=rows.get('quant.validationrequest',{}).get(str(result.get('request')), {})
    plan=rows.get('quant.validationplan',{}).get(str(request.get('plan')), {})
    source=rows.get('quant.experimentresult',{}).get(str(run.get('experiment_result')), {})
    entry=rows.get('quant.entry',{}).get(str(run.get('entry')), {})
    if (not result or result['data'].get('status')!='completed' or plan.get('source_request')!=source.get('request')
            or plan.get('anthology')!=entry.get('anthology') or run.get('planning_context',{}).get('fixed_validation')!={
                'result_id':str(run.get('validation_result')),'result_hash':result.get('content_hash')}):
        fail('固定验证解读来源、结果或冻结上下文不一致')
    return project(plan['data'],request['data'],result['data'])
