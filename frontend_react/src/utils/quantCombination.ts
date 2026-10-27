import type {CombinationAnalysis, CombinationPart, CombinationValues} from '../types/api/quantCombination';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function values(value: unknown): value is CombinationValues {
    return object(value) && ['total_return', 'max_drawdown', 'turnover', 'entries', 'missing_signals'].every(key => finite(value[key]));
}
function part(value: unknown): value is CombinationPart {
    if (!object(value) || !['comparable', 'unknown'].includes(String(value.status)) || typeof value.reason !== 'string'
        || !Array.isArray(value.ranges) || value.ranges.length !== 3 || !value.ranges.every(row => row === null || object(row) && typeof row.start === 'string' && typeof row.end === 'string' && finite(row.bars))
        || !Array.isArray(value.values) || value.values.length !== 3 || !value.values.every(row => row === null || values(row))) return false;
    if (value.status === 'unknown' ? value.deltas !== null : !object(value.deltas)
        || !finite(value.deltas.return_over_best_parent) || !finite(value.deltas.drawdown_over_lower_parent)
        || !Array.isArray(value.deltas.versus_parents) || value.deltas.versus_parents.length !== 2 || !value.deltas.versus_parents.every(values)) return false;
    if (value.status === 'comparable' && (value.values.some(row => row === null) || value.ranges.some(row => row === null)
        || new Set(value.ranges.map(row => JSON.stringify(row))).size !== 1)) return false;
    if (value.labels !== undefined) {
        const label = value.labels;
        if (!object(label) || !['comparable', 'unknown'].includes(String(label.status)) || label.target_ref !== 'execution.config.label_target'
            || !Array.isArray(label.values) || label.values.length !== 3 || !label.values.every(row => row === null || object(row)
                && typeof row.status === 'string' && (row.spearman_ic === null || finite(row.spearman_ic)) && finite(row.coverage) && finite(row.pairs) && typeof row.reason === 'string')
            || (label.status === 'unknown' ? label.versus_parents !== null : !Array.isArray(label.versus_parents)
                || label.versus_parents.length !== 2 || !label.versus_parents.every(row => object(row) && finite(row.spearman_ic) && finite(row.coverage)))) return false;
    }
    return true;
}
export function readCombinationAnalysis(json?: string): CombinationAnalysis | null {
    if (!json) return null;
    const value: unknown = JSON.parse(json);
    if (!object(value) || value.version !== 1 || value.method !== 'immediate-parent-delta-1'
        || value.scope !== 'same_request_same_costs_train_validation_only_immediate_parents'
        || value.claim !== 'descriptive_deltas_not_independent_complementarity_or_profit'
        || JSON.stringify(value.value_order) !== '["parent_1","parent_2","combination"]' || typeof value.delta_semantics !== 'string'
        || !Array.isArray(value.groups) || value.groups.length > 128 || !value.groups.every(row => object(row)
            && typeof row.attempt_id === 'string' && row.id === `combination:${row.attempt_id}` && typeof row.status === 'string'
            && typeof row.reason === 'string' && typeof row.operation === 'string' && typeof row.parent_scope_valid === 'boolean'
            && (row.outer_fold === null || Number.isInteger(row.outer_fold))
            && Array.isArray(row.parent_ids) && row.parent_ids.length === 2 && row.parent_ids.every(id => typeof id === 'string')
            && Array.isArray(row.parents) && row.parents.length === 2 && row.parents.every((parent, index) => object(parent)
                && parent.id === (row.parent_ids as string[])[index] && typeof parent.status === 'string' && typeof parent.reason === 'string')
            && Array.isArray(row.windows) && row.windows.length >= 1 && row.windows.length <= 4 && row.windows.every(window => object(window)
                && (window.inner_fold === null || Number.isInteger(window.inner_fold)) && object(window.parts) && part(window.parts.train) && part(window.parts.validation)))
        || new Set(value.groups.map(row => row.id)).size !== value.groups.length) throw new Error('组合增量记录版本或指标不完整');
    return value as unknown as CombinationAnalysis;
}
