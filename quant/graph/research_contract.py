"""Read-only graph claims keep their origin and evidential qualification explicit."""
import copy
from quant.research.contracts import digest
from quant.experiments.combination import analyze

METHOD = 'graph-research-evidence-1'
RULE = 'positive-return-risk-turnover-dominance-1'
EPSILON = 1e-12


def base(kind: str, candidate_id: str, candidate: dict, origin: dict) -> dict:
    return {'version': 1, 'method': METHOD, 'kind': kind, 'candidate_id': candidate_id,
        'candidate_hash': digest(candidate), 'origin': copy.deepcopy(origin), 'independent_evidence': False}


def outcome(group: dict) -> tuple[str, list[dict]]:
    outcomes = []
    accepted = group['status'] == 'evaluated' and all(row['status'] == 'evaluated' for row in group['parents'])
    for window in group['windows']:
        value = window['parts']['validation']
        status, reason = 'unknown', 'attempt_not_evaluated' if not accepted else value['reason']
        if accepted and value['status'] == 'comparable':
            a, b, combo = value['values']
            passed = (combo['total_return'] > EPSILON and combo['entries'] > 0
                and combo['total_return'] - max(a['total_return'], b['total_return']) > EPSILON
                and combo['max_drawdown'] - min(a['max_drawdown'], b['max_drawdown']) <= EPSILON
                and combo['turnover'] - min(a['turnover'], b['turnover']) <= EPSILON)
            status = 'supports' if passed else 'counterexample'
            reason = 'meets_descriptive_rule' if passed else 'does_not_meet_descriptive_rule'
        outcomes.append({'inner_fold': window['inner_fold'], 'status': status, 'reason': reason})
    statuses = {row['status'] for row in outcomes}
    return next(iter(statuses)) if len(statuses) == 1 else 'mixed', outcomes


def combination(candidate_id: str, candidate: dict, plan: dict, attempts: list[dict], group: dict,
                market: dict, origin: dict, interpretation: dict | None = None) -> dict:
    analysis = analyze(plan, attempts)
    analysis['groups'] = [copy.deepcopy(group)]
    status, outcomes = outcome(group)
    by_id = {row['id']: row for row in attempts}
    configurations = []
    for identity in [*group['parent_ids'], group['attempt_id']]:
        row = by_id.get(identity, {}); recipe = row.get('recipe') or {}
        configurations.append({'attempt_id': identity, 'status': row.get('status', 'missing'),
            'parameters': [{'name': key, 'original_name': recipe.get('parameter_names', {}).get(key, key), 'value': value}
                for key, value in sorted(recipe.get('parameters', {}).items())],
            'bindings': copy.deepcopy(recipe.get('bindings', {})),
            'expression_hash': digest(recipe['expression']) if recipe.get('expression') else None})
    return base('combination_observation', candidate_id, candidate, origin) | {
        'status': status, 'rule': {'method': RULE, 'epsilon': EPSILON,
            'claim': 'positive_validation_net_return_above_both_parents_without_more_drawdown_or_turnover_with_entries',
            'registered_before_experiment': False, 'uses_holdout': False},
        'market': copy.deepcopy(market), 'config': copy.deepcopy(plan['config']),
        'analysis': analysis, 'outcomes': outcomes, 'configurations': configurations,
        'ai_interpretation': copy.deepcopy(interpretation),
        'qualification': 'posthoc_descriptive_rule_only_not_general_complementarity_or_admission'}


def proposal(candidate_id: str, candidate: dict, data: dict, origin: dict) -> dict:
    return base('combination_hypothesis', candidate_id, candidate, origin) | {
        'status': 'hypothesis', 'hypothesis': data['hypothesis'], 'falsification': data['falsification'],
        'data_requirement': data['data_requirement'], 'config': copy.deepcopy(data['config']),
        'participants': [{'id': seed['id'], 'name': seed['candidate']['name'], 'candidate_hash': digest(seed['candidate']),
            'parameters': copy.deepcopy(seed['parameters']), 'bindings': copy.deepcopy(seed['bindings']),
            'variants': copy.deepcopy(seed['variants'])} for seed in data['seeds']],
        'evidence_refs': copy.deepcopy(data['evidence_refs']),
        'qualification': 'ai_proposed_combination_not_executed_or_verified'}


def scenario(candidate_id: str, candidate: dict, report: dict, origin: dict) -> dict:
    return base('scenario_hypothesis', candidate_id, candidate, origin) | {
        'status': 'hypothesis', 'text': report['usage'], 'scope': 'source_level_context_not_component_applicability',
        'assumptions_count': len(report.get('assumptions', [])), 'unknowns_count': len(report.get('unknowns', [])),
        'condition_availability': 'not_established', 'qualification': 'ai_static_usage_conditions_not_causal_regime_evidence'}


def feedback(candidate_id: str, candidate: dict, payload: dict, report: dict,
             field: str, index: int, origin: dict) -> dict:
    claim = report[field][index]
    return base('feedback_assessment', candidate_id, candidate, origin) | {
        'status': 'reported_support' if field == 'supporting_evidence' else 'reported_counterexample',
        'claim': claim['claim'], 'quote': claim['quote'], 'field': field, 'index': index,
        'mode': payload['mode'], 'platform': payload['platform'],
        'reported_parameters': [{key: row[key] for key in ('name', 'value', 'unit')}
            for row in report['reported_parameters'][:12]],
        'omitted_parameters': max(0, len(report['reported_parameters']) - 12),
        'unknowns_count': len(report['unknowns']), 'platform_authenticated': False,
        'qualification': 'ai_interpretation_of_user_report_not_verified_performance'}
