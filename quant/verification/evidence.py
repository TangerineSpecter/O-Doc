"""Rebuild direct evidence for one immutable formula, never inherit parent returns."""
import copy
from quant.research.contracts import digest

METRICS = ('total_return', 'max_drawdown', 'entries', 'turnover', 'exposure_fraction', 'missing_signals', 'bars', 'start', 'end')


def metrics(value):
    result = {key: value[key] for key in METRICS if key in (value or {})}
    if value and 'execution' in value:
        from quant.strategies.evidence import summary
        result['execution'] = summary(value)
    return result


def market(dataset):
    return {key: dataset.get(key) for key in ('symbol', 'timeframe', 'timezone', 'source', 'price_adjustment')}


def base(candidate, kind, target_id, target_hash):
    return {'version': 1, 'candidate_hash': digest(candidate), 'kind': kind, 'target_id': target_id, 'target_hash': target_hash}


def experiment(candidate_id, candidate, identity, result, plan, dataset, request_id):
    seed = next((row for row in plan['seeds'] if row['id'] == candidate_id and row['candidate'] == candidate), None)
    derived = candidate.get('derivation', {})
    is_derived = derived.get('request_id') == request_id
    if not seed and not is_derived: return None
    output = result.get('output') or {}
    direct, attempts = set(), []
    for item in output.get('attempts', []):
        related = (item['operation'] == 'source_candidate' and item['parents'] == [candidate_id]
            or item['operation'] == 'parameter_variant' and len(item['parents']) == 1 and item['parents'][0] in direct) if seed else item['id'] == derived['attempt_id']
        if not related: continue
        direct.add(item['id'])
        recipe = item.get('recipe') or {}
        attempts.append({key: copy.deepcopy(item.get(key)) for key in ('id', 'status', 'reason', 'operation', 'fold')} | {
            'parameters': [{'name': name, 'original_name': recipe.get('parameter_names', {}).get(name, name) if seed else name, 'value': value}
                for name, value in sorted(recipe.get('parameters', {}).items())],
            'bindings': ([{'name': name, 'column': column} for name, column in sorted(seed['bindings'].items())] if seed else
                [{'name': column, 'column': column} for column in sorted(set(recipe.get('bindings', {}).values()))]),
            'metrics': {part: metrics(values) for part, values in item.get('metrics', {}).items()}})
    evaluated = {row['id'] for row in attempts if row['status'] == 'evaluated'}
    held_out = []
    folds = output.get('walk_forward', {}).get('folds', [])
    for fold in folds or [output]:
        if fold.get('selected_id') in evaluated and fold.get('holdout') is not None:
            held_out.append({'number': fold.get('number'), 'attempt_id': fold['selected_id'],
                'partitions': copy.deepcopy(fold['partitions']), 'metrics': metrics(fold['holdout']),
                'status': fold['holdout_status'], 'prior_usage': 'unattested'})
    levels = (['calculation'] if evaluated else []) + (['historical_experiment'] if evaluated and result['status'] == 'completed' else [])
    if held_out: levels.append('heldout_observation')
    if len(held_out) >= 2: levels.append('rolling_observation')
    return base(candidate, 'experiment', identity, digest(result)) | {
        'scope': 'direct_portable_formula_and_actual_parameters', 'request_id': request_id,
        'dataset_hash': plan['dataset_hash'], 'market': market(dataset), 'engine_version': plan['engine_version'],
        'config': copy.deepcopy(plan['config']), 'result_status': result['status'], 'attempts': attempts,
        'error': result.get('error', ''), 'checkpoint_count': len(result.get('checkpoint_hashes', [])),
        'heldout': held_out, 'levels': levels, 'independent_validation': False,
        'overlap_audit': copy.deepcopy(result.get('overlap_audit', {})),
        'claim': 'recorded_runs_not_profitability_or_platform_equivalence'}


def comparison(candidate_id, candidate, identity, plan, result, record_hash, dataset):
    sides = [key for key in ('left', 'right') if plan[key]['id'] == candidate_id and plan[key]['candidate'] == candidate]
    if not sides: return None
    from quant.comparisons.output_compare import COUNT_FIELDS
    return base(candidate, 'comparison', identity, record_hash) | {
        'scope': 'fixed_sample_pair_not_universal_equivalence', 'market': market(dataset),
        'dataset_hash': plan['dataset_hash'], 'policy': plan['policy'], 'engine_version': plan['engine_version'],
        'sides': [{'side': side, 'parameters': [{'name': name, 'value': value} for name, value in sorted(plan[side]['parameters'].items())],
            'bindings': [{'name': name, 'column': column} for name, column in sorted(plan[side]['bindings'].items())]} for side in sides],
        'verdict': result['status'], 'evaluation_status': result['evaluation_status'],
        'counts': {key: result['counts'].get(key) for key in COUNT_FIELDS}, 'levels': ['sample_comparison'] + (
            ['calculation'] if result['evaluation_status'] == 'completed' and (result['counts'].get('common_valid') or 0) > 0 else []),
        'claim': 'direct_comparison_retains_counterexamples_not_performance_promotion'}


def feedback(candidate_id, candidate, identity, payload, source_hash):
    if payload.get('factor_id') != candidate_id: return None
    if payload.get('feedback_version')==4:
        return base(candidate,'feedback',identity,source_hash)|{'scope':'native_python_analysis_document',
            'mode':payload['mode'],'platform':payload['platform'],'title':payload['title'],
            'target_source_id':payload['target_source_id'],'document_format':payload['document_format'],
            'parser_status':'native_python_summary','accounting_status':'not_applicable','counts':{},
            'levels':[],'structured':True,'platform_authenticated':False,
            'claim':'native_summary_analysis_not_additional_independent_or_financial_evidence'}
    structured = payload.get('feedback_version') in (3,5)
    accounting = payload.get('execution_accounting', {})
    mode = payload['mode']
    return base(candidate, 'feedback', identity, source_hash) | {'scope': 'explicit_user_reported_factor_link',
        'mode': mode, 'platform': payload['platform'], 'title': payload['title'],
        'target_source_id': payload['target_source_id'], 'document_format': payload['document_format'],
        'parser_status': payload.get('execution_evidence', {}).get('parser_status', 'not_structured'),
        'accounting_status': accounting.get('status', 'unavailable'),
        'counts': copy.deepcopy(accounting.get('counts', {})),
        'levels': ['user_reported_' + mode] if mode in ('backtest', 'paper', 'live') else ['user_reported_other'],
        'structured': structured, 'platform_authenticated': False,
        'claim': 'uploaded_observation_not_verified_execution_or_live_profit'}


def fixed_validation(candidate_id,candidate,identity,result,fixed_request,fixed_plan,dataset,source_result,source_plan,source_dataset,*,include_incomplete=False):
    """Only a direct formula/parameter variant or its exact archived descendant."""
    original=experiment(candidate_id,candidate,'source',source_result,source_plan,source_dataset,fixed_plan['source']['request_id'])
    selected=fixed_plan['source']['attempt_id']
    if (result.get('status')!='completed' and not include_incomplete) or not original or selected not in {r['id'] for r in original['attempts']}:
        return None
    from quant.validation_studies.evidence import audit_summary
    value=base(candidate,'fixed_validation',identity,digest(result)) | {
        'scope':'direct_fixed_formula_and_actual_parameters_new_interval','source_request_id':fixed_plan['source']['request_id'],
        'source_attempt_id':selected,'dataset_hash':fixed_request['dataset_hash'],'market':market(dataset),
        'mode':fixed_request['mode'],'config':copy.deepcopy(fixed_plan['config']),'recipe':copy.deepcopy(fixed_plan['recipe']),
        'bounds':copy.deepcopy(fixed_request['bounds']),'metrics':metrics((result.get('output') or {}).get('final')),
        'baseline':metrics((result.get('output') or {}).get('baseline')),'publication_audit':audit_summary(result['publication_audit']) if result.get('publication_audit') else None,
        'levels':['fixed_observation'] if result['status']=='completed' else [],'independent_validation':False,
        'claim':'registered_fixed_observation_not_global_independence_or_profitability'}
    if result['status']!='completed':value.update(result_status=result['status'],error=result.get('error',''))
    if 'criteria_assessment' in result:
        value['registered_criteria']=copy.deepcopy(fixed_plan['criteria'])
        value['criteria_assessment']=copy.deepcopy(result['criteria_assessment'])
        value['criteria_context']={'mode':fixed_request['mode'],
            'imported_after_registration':fixed_request['imported_after_registration'],
            'audit':audit_summary(fixed_request['audit'])}
        if result['criteria_assessment']['eligibility']=='fresh_scope_criteria_met':
            value['levels'].append('registered_criteria_met')
    if fixed_plan.get('version') == 3:
        value['label_target'] = copy.deepcopy(fixed_plan['label_target'])
        value['label_evaluation'] = copy.deepcopy((result.get('output') or {}).get('label_evaluation'))
    return value
