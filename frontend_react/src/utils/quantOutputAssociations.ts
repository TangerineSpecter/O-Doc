import type {QuantOutputAssociations} from '../types/api/quantOutputAssociations';
import {readCorrelationStatistics} from './quantCorrelation';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value;
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value));
export function readOutputAssociations(json?: string | null): QuantOutputAssociations | null {
    if (!json) return null;
    const value: unknown = JSON.parse(json);
    if (!object(value) || value.version !== 1 || value.method !== 'review-output-associations-1'
        || value.scope !== 'same_dataset_hash_planning_options_with_original_parent' || value.limit !== 8 || !date(value.cutoff)
        || !Number.isSafeInteger(value.known_matches) || (value.known_matches as number) < 0 || (value.known_matches as number) > 9
        || typeof value.complete_scan !== 'boolean' || value.complete_scan !== ((value.known_matches as number) <= 8)
        || value.omitted_at_least !== Math.max(0, (value.known_matches as number) - 8)
        || !Array.isArray(value.items) || value.items.length !== Math.min(8, value.known_matches as number)) throw new Error('输出统计上下文的版本或计数无效');
    const identities = new Set<string>();
    for (const row of value.items) {
        if (!object(row)) throw new Error('输出统计记录缺失');
        const dataset = row.dataset, policy = row.policy;
        if (!text(row.relation_id) || identities.has(row.relation_id) || !text(row.relation_hash)
            || !text(row.comparison_id) || !text(row.comparison_hash) || !text(row.comparison_name) || !date(row.created_at)
            || Date.parse(row.created_at as string) >= Date.parse(value.cutoff as string) || row.selection_used !== false
            || row.claim !== 'historical_full_comparison_sample_not_current_windows_or_independent_complementarity'
            || !object(dataset) || !['id', 'content_hash', 'symbol', 'timeframe', 'timezone', 'source', 'price_adjustment'].every(key => typeof dataset[key] === 'string')
            || !Array.isArray(row.sides) || row.sides.length !== 2 || !row.sides.every(side => object(side)
                && text(side.candidate_id) && text(side.name) && text(side.candidate_hash) && typeof side.current_baseline_matches === 'boolean'
                && object(side.parameters) && Object.values(side.parameters).every(v => typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v))
                && object(side.bindings) && Object.values(side.bindings).every(text))) throw new Error('输出统计的来源或实际参数不可读取');
        if (row.sides[0].candidate_id === row.sides[1].candidate_id || row.baseline_scope !== (row.sides.every(side => side.current_baseline_matches) ? 'current_baselines_match' : 'historical_configuration_only')) throw new Error('输出统计的参数适用范围不一致');
        const stats = readCorrelationStatistics(row.statistics);
        if (!object(policy) || policy.version !== 1 || policy.warmup_bars !== stats.counts.warmup_rows
            || !['absolute_tolerance', 'relative_tolerance'].every(key => typeof policy[key] === 'number' && Number.isFinite(policy[key]) && policy[key] >= 0)) throw new Error('输出统计的预热与原对照规则不一致');
        identities.add(row.relation_id);
    }
    return value as unknown as QuantOutputAssociations;
}
