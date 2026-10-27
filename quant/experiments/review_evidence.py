"""Minimal, reproducible model evidence from immutable local experiment facts."""
import copy
import json
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest

METRICS = ('total_return', 'max_drawdown', 'entries', 'turnover', 'exposure_fraction',
           'missing_signals', 'bars', 'start', 'end')


def project(plan: dict, snapshot: dict, outcome: dict, attempts: list[dict], *, planning_options: list | None = None, library_context: dict | None = None, sensitivity: bool = False, joint_sensitivity: bool = False, research_memory: dict | None = None, fixed_validation: dict | None = None, selection_diagnostic: dict | None = None, temporal_sensitivity: bool = False, window_reviews: bool = False, context_encoding: bool = False, combinations: bool = False, output_associations: dict | None = None) -> dict:
    """Do not send raw CSV, equity paths, returns, credentials or unrelated research."""
    output = outcome.get('output') or {}
    evidence = {
        'dataset': {key: snapshot.get(key) for key in ('symbol', 'timeframe', 'timezone', 'price_adjustment', 'source')},
        'execution': {'engine_version': plan['engine_version'], 'config': plan['config'],
            'status': outcome['status'], 'error': outcome['error'], 'stop_reason': output.get('stop_reason'),
            'selection_rule': output.get('selection_rule'), 'selected_id': output.get('selected_id'),
            'frontier_ids': output.get('frontier_ids', []), 'limitations': output.get('limitations', []),
            'semantics': '收盘信号决定下一根开盘做多/空仓；末尾平仓，单侧费用及滑点，开盘净值采样；不等价于原平台'},
        'reuse': {key: outcome.get('overlap_audit', {}).get(key) for key in ('scope', 'total', 'independent_holdout_proven')},
    }
    if 'strategy' in plan['config']:
        from quant.strategies.policy import SEMANTICS
        evidence['execution']['semantics'] = SEMANTICS
    if 'label_target' in plan['config']:
        evidence['execution']['label_semantics'] = '各窗口标签终点须在本段内，段末跨界起点先剔除；IC为描述性相关，配对可重叠，不提供p值或独立样本量。target_ref均指execution.config.label_target。'
    rows = snapshot['rows']
    evidence['dataset'].update(row_count=len(rows), start=rows[0]['timestamp'], end=rows[-1]['timestamp'])
    for part, bounds in output.get('partitions', {}).items():
        evidence[f'partition:{part}'] = {'start': rows[bounds[0]]['timestamp'], 'end': rows[bounds[1]]['timestamp'],
            'return_intervals': bounds[1] - bounds[0]}
    for seed in plan['seeds']:
        candidate = seed['candidate']
        evidence[f"seed:{seed['id']}"] = {'name': candidate['name'], 'formula': candidate['formula'],
            'expression': candidate['expression'], 'output_type': candidate['output_type'], 'units': candidate['units'],
            'parameters': candidate['parameters'], 'inputs': candidate['inputs'], 'limitations': candidate['limitations'],
            'bindings': seed['bindings'], 'actual_parameters': seed['parameters'], 'planned_variants': seed.get('variants', [])}
        if candidate.get('derivation'):
            evidence[f"seed:{seed['id']}"]['derivation'] = candidate['derivation']
        if candidate.get('formula_version'):
            evidence[f"seed:{seed['id']}"]['formula_version'] = candidate['formula_version']
            evidence[f"seed:{seed['id']}"]['source_role'] = 'ancestor_context_not_authored_formula_source'
    for attempt in attempts:
        # Include every failed and stopped attempt, not only the selected winner.
        evidence[attempt['id']] = {key: attempt.get(key) for key in ('parents', 'operation', 'generation',
            'requested_parameters', 'status', 'reason', 'complexity', 'recipe', 'metrics')}
        if 'transformation' in attempt:
            evidence[attempt['id']]['transformation'] = attempt['transformation']
        if 'fold' in attempt:
            evidence[attempt['id']]['fold'] = attempt['fold']
        if 'inner_evaluation' in attempt:
            nested = attempt['inner_evaluation']
            evidence[attempt['id']]['inner_evaluation'] = {**copy.deepcopy(nested),
                'folds': [{'number': row['number'], 'metrics': {name: metric_evidence(metric)
                    for name, metric in row['metrics'].items()}, **({'label_metrics': {key: label_evidence(value) for key,value in row['label_metrics'].items()}}
                        if 'label_metrics' in row else {})} for row in nested['folds']],
                'metric_scope': 'top_level_metrics_are_last_started_inner_fold; selection_uses_complete_inner_summary'}
        if 'label_evaluation' in attempt:
            evidence[attempt['id']]['label_evaluation'] = {'version':1,'metrics':{key:label_evidence(value) for key,value in attempt['label_evaluation']['metrics'].items()}}
    if output.get('walk_forward'):
        evidence['walk_forward'] = output['walk_forward']['summary']
        for fold in output['walk_forward']['folds']:
            evidence[f"fold:{fold['number']}"] = {key: value for key, value in fold.items()
                if key not in ('holdout', 'buy_hold_baseline')}
            if 'label_holdout' in fold: evidence[f"fold:{fold['number']}"]['label_holdout'] = label_evidence(fold['label_holdout'])
            for key in ('holdout', 'buy_hold_baseline'):
                evidence[f"fold:{fold['number']}"][key] = metric_evidence(fold[key]) if fold[key] else None
    for key, field in [('holdout', 'holdout'), ('baseline', 'buy_hold_baseline')]:
        metric = output.get(field)
        evidence[key] = metric_evidence(metric) if metric else None
    if 'label_target' in plan['config']:
        evidence['label_holdout'] = label_evidence(output.get('label_holdout'))
    value = {'version': 1, 'metric_units': 'return/drawdown/exposure are fractions; fees/slippage are bps per side; entries are counts',
        'independent_holdout_proven': False, 'evidence': evidence}
    if planning_options is not None:
        value.update(version=2, planning_options=planning_options)
    if library_context is not None:
        from .library_contract import summary
        value['library_retrieval'] = summary(library_context)
        for row in library_context['retrieved']:
            candidate = next(item['candidate'] for item in library_context['options'] if item['id'] == row['candidate_id'])
            evidence[f"library:{row['candidate_id']}"] = {**row, 'name': candidate['name'],
                'source_evidence': candidate['evidence'], 'status': 'not_evaluated_in_this_result'}
    if library_context is not None and library_context.get('version') in (6, 7):
        from .planning_capabilities import validate
        validate(library_context.get('planning_capabilities'))
        value['planning_capabilities'] = copy.deepcopy(library_context['planning_capabilities'])
    if sensitivity:
        from .sensitivity import analyze
        evidence['parameter_sensitivity'] = analyze(plan, attempts)
    if joint_sensitivity:
        from .joint_sensitivity import analyze as joint_analysis
        evidence['parameter_joint_sensitivity'] = joint_analysis(plan, attempts)
    if temporal_sensitivity:
        from .temporal_sensitivity import analyze as temporal_analysis, model_evidence
        temporal = temporal_analysis(plan, attempts)
        if temporal is not None:
            evidence['temporal_parameter_stability'] = model_evidence(temporal)
    if window_reviews:
        from .window_review import project as window_project
        evidence.update(window_project(plan, snapshot, attempts, canonical_pairs=context_encoding))
    if combinations:
        from .combination import evidence as combination_evidence
        evidence.update(combination_evidence(plan, attempts))
    if output_associations is not None:
        from .output_associations import evidence as association_evidence
        evidence.update(association_evidence(output_associations))
    if research_memory is not None:
        from quant.research_memory import summary
        value['research_memory'] = summary(research_memory)
        for row in research_memory['items']:
            evidence[f"memory:{row['kind']}:{row['id']}"] = copy.deepcopy(row)
    if fixed_validation is not None:
        evidence['fixed_validation'] = copy.deepcopy(fixed_validation)
    if selection_diagnostic is not None:
        evidence['selection_diagnostic']=copy.deepcopy(selection_diagnostic)
    if context_encoding:
        from .context_encoding import VERSION
        value['model_context_encoding'] = VERSION
    # Explicit failure instead of silently dropping evidence or truncating failed trials.
    if len(json.dumps(value, ensure_ascii=False, allow_nan=False)) > 160000:
        raise ValidationError('本次实验解读材料超过上限，请缩小单批实验后重试')
    return copy.deepcopy(value)


def metric_evidence(metric):
    value = {name: metric[name] for name in METRICS}
    if 'execution' in metric:
        from quant.strategies.evidence import summary
        value['execution'] = summary(metric, sample=True)
    return value


def label_evidence(value):
    if value is None: return None
    return {key:copy.deepcopy(item) for key,item in value.items() if key not in ('target','limitations')} | {
        'target_ref':'execution.config.label_target','semantics_ref':'execution.label_semantics'}


def for_result(result, version: int = 2, context: dict | None = None, fixed=None, *, latest_at: str | None = None) -> dict:
    request = result.request
    if version not in (9,10,11,12,13,14,15,16,17) and ('strategy' in request.plan['config']) != (version == 8):
        raise ValidationError('策略执行实验必须使用匹配版本的解读契约')
    from .planning_context import for_result as planning_options
    if version in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) and (not isinstance(context, dict) or context.get('version') != (7 if version == 17 else 6 if version in (11, 12, 13, 14, 15, 16, 17) else 5 if version == 10 else 4 if version == 9 else 3 if version in (7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) else 2 if version == 6 else 1)):
        raise ValidationError('新版实验解读缺少冻结的跨库研究上下文')
    if version in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17):
        from .library_contract import METHOD, METHOD_V2
        if context.get('method') != (METHOD_V2 if version in (15, 16, 17) else METHOD):
            raise ValidationError('实验解读版本与跨库去重合同不一致')
    from quant.validation_studies.evidence import for_result as fixed_evidence
    from quant.search_diagnostics.services import from_reference
    from quant.search_diagnostics.evidence import summary as diagnostic_summary
    diagnostic=from_reference(result,context.get('selection_diagnostic')) if version in (10, 11, 12, 13, 14, 15, 16, 17) else None
    if version == 9 and not fixed or fixed and version not in (9,10,11,12,13,14,15,16,17):
        raise ValidationError('固定验证解读版本与结果引用不匹配')
    if version in (9,10,11,12,13,14,15,16,17) and context.get('fixed_validation') != ({'result_id': fixed.pk, 'result_hash': fixed.content_hash} if fixed else None):
        raise ValidationError('固定验证冻结上下文不一致')
    associations = None
    if version == 17:
        from .output_associations import for_result as association_context
        associations = association_context(result, context.get('output_associations'), context['options'], latest_at=latest_at)
    return project(request.plan, request.dataset.snapshot, result.data,
        list(request.checkpoints.values_list('attempt', flat=True)),
        planning_options=context['options'] if version in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) else planning_options(result) if version == 2 else None,
        library_context=context if version in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) else None, sensitivity=version in (4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17), joint_sensitivity=version in (5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17), research_memory=context.get('research_memory') if version in (6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17) else None, fixed_validation=fixed_evidence(fixed) if fixed else None,selection_diagnostic=diagnostic_summary(diagnostic) if diagnostic else None, temporal_sensitivity=version in (12,13,14,15,16,17), window_reviews=version in (13,14,15,16,17), context_encoding=version in (14,15,16,17), combinations=version in (16, 17), output_associations=associations)


def evidence_hash(evidence: dict) -> str:
    return digest(evidence)


def for_run(run):
    return for_result(run.experiment_result, run.review_version, run.planning_context, run.validation_result,
        latest_at=run.created_at.isoformat() if run.review_version == 17 else None)
