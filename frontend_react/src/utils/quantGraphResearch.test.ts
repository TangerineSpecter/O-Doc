import assert from 'node:assert/strict';
import test from 'node:test';
import type {GraphResearch, GraphCombinationObservation} from '../types/api/quantGraphResearch';
import type {MockExperiment} from '../mocks/quant/experiments';
import {mockCombination} from '../mocks/quant/combination';
import {readGraphResearch, graphCombinationOutcomes} from './quantGraphResearch';

function fixture(): GraphCombinationObservation {
    const metric = (profit: number) => ({total_return: profit, max_drawdown: .02, turnover: 2, entries: 2, missing_signals: 0, start: '2024-01-01', end: '2024-01-11', bars: 10});
    const attempts = [.1, .08, .09].map((profit, n) => ({id: `attempt-${n + 1}`, parents: n < 2 ? ['seed'] : ['attempt-1', 'attempt-2'], operation: n < 2 ? 'source_candidate' : 'mean',
        status: 'evaluated', reason: '', metrics: {train: metric(profit), validation: metric(profit)}}));
    const analysis = JSON.parse(mockCombination({input: {config: {}}, data: {attemptsJson: JSON.stringify(attempts)}} as unknown as MockExperiment));
    return {version: 1, method: 'graph-research-evidence-1', candidate_id: 'candidate', candidate_hash: 'hash',
        kind: 'combination_observation', independent_evidence: false, qualification: 'posthoc_descriptive_rule_only_not_general_complementarity_or_admission',
        origin: {kind: 'experiment_result', id: 'result', content_hash: 'hash', created_at: '2026-01-01T00:00:00Z'},
        status: 'counterexample', rule: {method: 'positive-return-risk-turnover-dominance-1', epsilon: 1e-12,
            claim: 'positive_validation_net_return_above_both_parents_without_more_drawdown_or_turnover_with_entries', registered_before_experiment: false, uses_holdout: false},
        analysis, market: {symbol: 'SYNTHETIC'}, config: {fee_bps: 5, slippage_bps: 5},
        outcomes: [{inner_fold: null, status: 'counterexample', reason: 'does_not_meet_descriptive_rule'}],
        configurations: attempts.map(row => ({attempt_id: row.id, status: row.status, parameters: [], bindings: {}, expression_hash: 'hash'})), ai_interpretation: null};
}
test('graph classification is tied to actual window values, not profitable headline or a score', () => {
    const value = fixture();
    assert.equal(readGraphResearch(JSON.stringify(value), 'candidate').status, 'counterexample');
    const forged = structuredClone(value); forged.status = 'supports';
    assert.throws(() => readGraphResearch(JSON.stringify(forged), 'candidate'));
    const group = value.analysis.groups[0]; group.windows[0].parts.validation.values[2]!.total_return = .12;
    assert.equal(graphCombinationOutcomes(group).status, 'supports');
    group.status = 'rejected'; assert.equal(graphCombinationOutcomes(group).status, 'unknown');
});
test('field ordering is immaterial while formula and independent status cannot be substituted', () => {
    const value = fixture();
    const reordered = JSON.parse(JSON.stringify(value));
    reordered.outcomes = [{reason: 'does_not_meet_descriptive_rule', status: 'counterexample', inner_fold: null}];
    assert.equal(readGraphResearch(JSON.stringify(reordered), 'candidate').status, 'counterexample');
    assert.throws(() => readGraphResearch(JSON.stringify(value), 'other'));
    assert.throws(() => readGraphResearch(JSON.stringify({...value, independent_evidence: true}), 'candidate'));
    assert.throws(() => readGraphResearch(JSON.stringify({...value, rule: {...value.rule, uses_holdout: true}}), 'candidate'));
});
test('reported feedback and source condition hypotheses retain their unverified qualification', () => {
    const original = fixture();
    const feedback: GraphResearch = {...original, kind: 'feedback_assessment', status: 'reported_counterexample',
        field: 'counter_evidence', index: 0, claim: '报告负收益', quote: 'net=-2%', mode: 'paper', platform: 'MT4',
        reported_parameters: [{name: 'N', value: '10', unit: 'bar'}], omitted_parameters: 0, unknowns_count: 2, platform_authenticated: false};
    assert.equal(readGraphResearch(JSON.stringify(feedback), 'candidate').status, 'reported_counterexample');
    assert.throws(() => readGraphResearch(JSON.stringify({...feedback, platform_authenticated: true}), 'candidate'));
    const scenario: GraphResearch = {...original, kind: 'scenario_hypothesis', status: 'hypothesis', text: '用途条件待验证',
        scope: 'source_level_context_not_component_applicability', assumptions_count: 1, unknowns_count: 2, condition_availability: 'not_established'};
    assert.equal(readGraphResearch(JSON.stringify(scenario), 'candidate').status, 'hypothesis');
    assert.throws(() => readGraphResearch(JSON.stringify({...scenario, condition_availability: 'verified'}), 'candidate'));
});
