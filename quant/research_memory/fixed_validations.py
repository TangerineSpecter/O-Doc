"""Historical fixed outcomes are development evidence, never a fresh test of a new claim."""
import copy
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from quant.validation_studies.evidence import audit_summary
from quant.verification.evidence import metrics
from .contract import instant
from .evidence import market


def record(identity,result,request,plan,dataset,source,*,cutoff=None):
    data,prepared,frozen=result['data'],request['data'],plan['data']
    if (result['content_hash']!=digest(data) or request['content_hash']!=digest(prepared) or plan['content_hash']!=digest(frozen)
            or prepared['plan_hash']!=plan['content_hash'] or prepared['dataset_hash']!=dataset['content_hash']
            or str(dataset['anthology'])!=str(plan['anthology']) or str(plan['source_request'])!=source['evidence']['request_id']
            or frozen['source']['result_hash']!=source['content_hash']):
        raise ValidationError('历史固定验证来源、哈希或归属不一致')
    if data['status'] not in ('completed','failed','cancelled'):
        raise ValidationError('历史固定验证成果状态无效')
    parents=frozen['source']['parents']
    ids=set(parents)
    seeds=[s for s in source['seeds'] if s['id'] in ids]
    if len(seeds)!=len(ids) or not seeds or source['collection_id']!=str(plan['anthology']):
        raise ValidationError('历史固定验证实际父代不完整')
    if (instant(plan['created_at'])>instant(request['created_at']) or instant(request['created_at'])>instant(result['created_at'])
            or instant(source['created_at'])>instant(plan['created_at']) or cutoff and instant(result['created_at'])>=instant(cutoff)):
        raise ValidationError('历史固定验证时间链无效')
    output=data.get('output'); final=metrics(output['final']) if output else None; baseline=metrics(output['baseline']) if output else None
    negative=data['status']!='completed' or bool(final and (final['total_return']<=0 or final['total_return']<=baseline['total_return'] or final['missing_signals']>0))
    evidence={'result_id':identity,'request_id':str(result['request']),'plan_id':str(request['plan']),
        'plan_hash':plan['content_hash'],'request_hash':request['content_hash'],'source':copy.deepcopy(frozen['source']),
        'status':data['status'],'error':data.get('error',''),'mode':prepared['mode'],
        'recipe':copy.deepcopy(frozen['recipe']),'config':copy.deepcopy(frozen['config']),'bounds':copy.deepcopy(prepared['bounds']),
        'dataset':{**market(dataset['snapshot']),'content_hash':dataset['content_hash']},
        'final':final,'baseline':baseline,'authorization_audit':audit_summary(prepared['audit']),
        'publication_audit':audit_summary(data['publication_audit']) if data.get('publication_audit') else None,
        'historical_evaluation_exposed':True,'independent_validation':False,
        'scope':'historical_fixed_outcome_for_new_hypotheses_not_unseen_evidence',
        'claim':'one_frozen_recipe_not_parameter_optimality_or_platform_equivalence'}
    if data.get('version')==2:
        evidence['registered_criteria']=copy.deepcopy(frozen['criteria'])
        evidence['criteria_assessment']=copy.deepcopy(data['criteria_assessment'])
        evidence['imported_after_registration']=prepared['imported_after_registration']
        negative=negative or data['criteria_assessment']['status']!='met'
    return {'id':identity,'kind':'fixed_validation','title':frozen['name'],'entry_id':seeds[0]['entry_id'],
        'collection_id':str(plan['anthology']),'created_at':instant(result['created_at']).isoformat(),
        'content_hash':result['content_hash'],'seeds':seeds,'market':market(dataset['snapshot']),
        'evidence':evidence,'has_negative_evidence':bool(negative)}
