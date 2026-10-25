"""Deterministic layers from direct evidence; never a profitability certificate."""
import copy
from quant.research.contracts import digest

STAGES=('candidate','reusable','calculated','historical','fixed_observation','registered_criteria_met')
REVIEW_OUTCOMES={'blocked','output_mismatch','criteria_not_met','no_computation','comparison_inconclusive','partial_computation','criteria_unknown'}


def sample(metrics):
    return {key:copy.deepcopy(metrics[key]) for key in ('bars','start','end') if key in (metrics or {})}


def observations(value,context=None):
    kind=value['kind'];common={key:copy.deepcopy(value.get(key)) for key in ('market','dataset_hash','config')}
    if kind=='experiment':
        heldout=value.get('heldout',[]);scopes=[]
        for item in value['attempts']:
            calculated=item['status']=='evaluated'
            scopes.append({**common,'observation_id':item['id'],'parameters':copy.deepcopy(item['parameters']),
                'bindings':copy.deepcopy(item['bindings']),'status':item['status'],'reason':item['reason'],'fold':item['fold'],
                'stage':'historical' if calculated and value['result_status']=='completed' else 'calculated' if calculated else None,
                'sample':{phase:sample(metric) for phase,metric in item['metrics'].items()},
                'heldout':[{key:copy.deepcopy(row[key]) for key in ('number','attempt_id','partitions','status')}|{'sample':sample(row['metrics'])}
                    for row in heldout if row['attempt_id']==item['id']],
                'engine_version':value['engine_version'],'criteria':None,'criteria_status':'not_registered'})
        count=sum(row['stage'] is not None for row in scopes)
        return scopes,'computed' if count and value['result_status']=='completed' else 'partial_computation' if count else 'no_computation'
    if kind=='fixed_validation':
        criteria=value.get('criteria_assessment');eligibility=(criteria or {}).get('eligibility')
        complete=value.get('result_status','completed')=='completed'
        stage=None if not complete else 'registered_criteria_met' if eligibility=='fresh_scope_criteria_met' else 'fixed_observation'
        outcome=('criteria_met' if stage=='registered_criteria_met' else 'reused_criteria_met' if eligibility=='criteria_met_reuse_or_audit_unknown'
            else 'criteria_not_met' if eligibility=='criteria_not_met' else 'criteria_unknown') if criteria else 'observed'
        if not complete:outcome='criteria_unknown' if criteria else 'no_computation'
        return [{**common,'status':value.get('result_status','completed'),'reason':value.get('error',''),'sample_status':'observed' if complete else 'planned_not_completed','observation_id':value['target_id'],'recipe':copy.deepcopy(value['recipe']),
            'parameters':copy.deepcopy(value['recipe']['parameters']),'bindings':copy.deepcopy(value['recipe']['bindings']),
            'sample':copy.deepcopy(value['bounds']),'stage':stage,'criteria':copy.deepcopy(value.get('registered_criteria')),
            'criteria_status':(criteria or {}).get('status','not_registered'),'eligibility':eligibility,
            'checks':copy.deepcopy((criteria or {}).get('checks',{})),'publication_audit':copy.deepcopy(value['publication_audit']),
            'criteria_context':copy.deepcopy(value.get('criteria_context'))}],outcome
    if kind in ('native_python','comparison'):
        comparison=value.get('comparison') if kind=='native_python' else value
        counts=(comparison or {}).get('counts') or {};calculated=(counts.get('common_valid') or 0)>0
        verdict=value['verdict'];stage='calculated' if calculated else None
        sides=[{'side':'original_python_function','parameters':value['parameters'],'bindings':value['bindings']}] if kind=='native_python' else value['sides']
        scopes=[]
        for side in sides:
            scopes.append({**common,'observation_id':side['side'],'parameters':copy.deepcopy(side['parameters']),
                'bindings':copy.deepcopy(side['bindings']),'stage':stage,'sample':copy.deepcopy(value.get('dataset') if kind=='native_python' else context),
                'comparison_policy':copy.deepcopy(value['policy'] if kind=='comparison' else value.get('policy')),
                'verdict':verdict,'counts':copy.deepcopy(counts),'criteria':None,'criteria_status':'not_applicable',
                'native_configuration':copy.deepcopy(value.get('native')),
                'native_environment':copy.deepcopy(value.get('environment'))})
        if kind=='native_python':
            for scope in scopes:
                scope['market']=copy.deepcopy(value['dataset']['market']);scope['dataset_hash']=value['dataset']['sample_hash']
        return scopes,'output_match' if verdict=='pass' else 'output_mismatch' if verdict=='fail' else 'comparison_inconclusive' if calculated else 'no_computation'
    return [{**common,'observation_id':value['target_id'],'stage':None,'mode':value['mode'],
        'platform':value['platform'],'criteria':None,'criteria_status':'user_reported_unverified'}],'user_reported'


def assess(qualification,basis):
    ready=qualification['reuse_status']=='reusable'
    base='reusable' if ready else 'candidate'
    if basis['kind']=='qualification':scopes=[];outcome='admitted' if ready else 'blocked'
    else:scopes,outcome=observations(basis['data'],basis.get('context'))
    for scope in scopes:
        scope['observed_stage']=scope['stage'];scope['stage']=scope['stage'] if ready and scope['stage'] else base
        scope['scope_key']=digest({key:scope.get(key) for key in ('market','parameters','bindings','recipe','config','criteria')})
    stage=max([base,*[scope['stage'] for scope in scopes]],key=STAGES.index)
    return {'version':1,'method':'portable-research-admission-v1','candidate_hash':qualification['candidate_hash'],
        'qualification_hash':digest(qualification),'basis':{key:basis[key] for key in ('kind','id','content_hash')},
        'stage':stage,'outcome':outcome,'blockers':copy.deepcopy(qualification['blockers']),
        'scopes':scopes,'scope':'exact_formula_and_observation_configuration',
        'independent_validation':False,'platform_equivalence':'unverified','economic_effectiveness':'unassessed',
        'claim':'recorded_research_layers_not_universal_or_financial_approval'}


def identity(candidate_id,basis_id):
    return digest(['factor-admission-1',candidate_id,basis_id])[:40]


def comparison_context(result):
    return {key:copy.deepcopy(result.get(key)) for key in ('start','end','comparison_start')}|{
        'sample_row_count':result['counts']['total_rows'],'compared_row_count':result['counts']['compared_rows']}
