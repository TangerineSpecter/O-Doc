import type {CombinationGroup} from '../types/api/quantCombination';
import type {GraphResearch, CombinationOutcome} from '../types/api/quantGraphResearch';
import {readCombinationAnalysis} from './quantCombination';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value;
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const scalar = (value: unknown) => typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value);
const parameters = (value: unknown) => object(value) && Object.values(value).every(scalar);
const bindings = (value: unknown) => object(value) && Object.values(value).every(v => typeof v === 'string');
export function graphCombinationOutcomes(group: CombinationGroup) {
    const accepted = group.status === 'evaluated' && group.parents.every(row => row.status === 'evaluated');
    const outcomes = group.windows.map(window => {
        const part = window.parts.validation;
        let status: Exclude<CombinationOutcome, 'mixed'> = 'unknown';
        let reason = accepted ? part.reason : 'attempt_not_evaluated';
        if (accepted && part.status === 'comparable') {
            const [a, b, combo] = part.values;
            const passed = !!a && !!b && !!combo && combo.total_return > 1e-12 && combo.entries > 0
                && combo.total_return - Math.max(a.total_return, b.total_return) > 1e-12
                && combo.max_drawdown - Math.min(a.max_drawdown, b.max_drawdown) <= 1e-12
                && combo.turnover - Math.min(a.turnover, b.turnover) <= 1e-12;
            status = passed ? 'supports' : 'counterexample'; reason = passed ? 'meets_descriptive_rule' : 'does_not_meet_descriptive_rule';
        }
        return {inner_fold: window.inner_fold, status, reason};
    });
    const statuses = new Set(outcomes.map(row => row.status));
    const status: CombinationOutcome = statuses.size === 1 ? outcomes[0].status : 'mixed';
    return {status, outcomes};
}
export function readGraphResearch(json: string, candidate: string): GraphResearch {
    const value: unknown = JSON.parse(json);
    if (!object(value)) throw new Error('研究关系记录缺失');
    const origin = value.origin;
    if (value.version !== 1 || value.method !== 'graph-research-evidence-1'
        || value.candidate_id !== candidate || !text(value.candidate_hash) || value.independent_evidence !== false
        || !text(value.qualification) || !object(origin) || !['kind', 'id', 'content_hash', 'created_at'].every(key => text(origin[key]))) throw new Error('研究关系的版本或公式归属不一致');
    if (value.kind === 'scenario_hypothesis') {
        if (value.status !== 'hypothesis' || value.scope !== 'source_level_context_not_component_applicability'
            || value.condition_availability !== 'not_established' || !text(value.text) || !count(value.assumptions_count) || !count(value.unknowns_count)) throw new Error('情景描述必须保持静态假设与来源范围');
    } else if (value.kind === 'combination_hypothesis') {
        if (value.status !== 'hypothesis' || !['hypothesis', 'falsification', 'data_requirement'].every(key => text(value[key]))
            || !object(value.config) || !Array.isArray(value.evidence_refs) || !value.evidence_refs.every(text)
            || !Array.isArray(value.participants) || value.participants.length < 2 || value.participants.length > 8
            || !value.participants.every(row => object(row) && text(row.id) && text(row.name) && text(row.candidate_hash)
                && parameters(row.parameters) && bindings(row.bindings) && Array.isArray(row.variants) && row.variants.length <= 16 && row.variants.every(parameters))
            || new Set(value.participants.map(row => row.id)).size !== value.participants.length
            || !value.participants.some(row => row.id === candidate && row.candidate_hash === value.candidate_hash)) throw new Error('组合假设缺少真实父代、原参数或否证条件');
    } else if (value.kind === 'feedback_assessment') {
        if (!['reported_support', 'reported_counterexample'].includes(String(value.status)) || !text(value.claim) || !text(value.quote)
            || value.field !== (value.status === 'reported_support' ? 'supporting_evidence' : 'counter_evidence') || !count(value.index)
            || typeof value.mode !== 'string' || typeof value.platform !== 'string' || value.platform_authenticated !== false
            || !count(value.omitted_parameters) || !count(value.unknowns_count) || !Array.isArray(value.reported_parameters)
            || value.reported_parameters.length > 12 || !value.reported_parameters.every(row => object(row) && ['name', 'value', 'unit'].every(key => typeof row[key] === 'string'))) throw new Error('反馈主张缺少原文或被错误晋升为已核实');
    } else if (value.kind === 'combination_observation') {
        const rule = value.rule, config = value.config;
        const analysis = readCombinationAnalysis(JSON.stringify(value.analysis));
        if (!object(rule) || rule.method !== 'positive-return-risk-turnover-dominance-1' || rule.epsilon !== 1e-12
            || rule.claim !== 'positive_validation_net_return_above_both_parents_without_more_drawdown_or_turnover_with_entries'
            || rule.registered_before_experiment !== false || rule.uses_holdout !== false || !analysis || analysis.groups.length !== 1
            || !object(config) || !['fee_bps', 'slippage_bps'].every(key => typeof config[key] === 'number' && Number.isFinite(config[key]))
            || !object(value.market) || !Object.values(value.market).every(v => v === null || typeof v === 'string')
            || !Array.isArray(value.configurations) || value.configurations.length !== 3
            || !value.configurations.every(row => object(row) && text(row.attempt_id) && text(row.status) && bindings(row.bindings)
                && (row.expression_hash === null || text(row.expression_hash)) && Array.isArray(row.parameters)
                && row.parameters.every(p => object(p) && text(p.name) && text(p.original_name) && scalar(p.value)))) throw new Error('组合对照缺少窗口、实际参数或固定规则');
        const expected = graphCombinationOutcomes(analysis.groups[0]);
        if (value.status !== expected.status || !Array.isArray(value.outcomes) || value.outcomes.length !== expected.outcomes.length
            || value.outcomes.some((row, n) => !object(row) || row.inner_fold !== expected.outcomes[n].inner_fold
                || row.status !== expected.outcomes[n].status || row.reason !== expected.outcomes[n].reason)) throw new Error('组合支持/反例与逐窗真实指标不一致');
        const interpretation = value.ai_interpretation;
        if (interpretation !== null && (!object(interpretation)
            || !['text', 'report_id', 'report_hash'].every(key => text(interpretation[key])))) throw new Error('组合解读未绑定原报告');
    } else throw new Error('未知研究关系类型');
    return value as unknown as GraphResearch;
}
