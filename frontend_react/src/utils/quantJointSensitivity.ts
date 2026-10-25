import type {QuantJointSensitivity} from '../types/api/quantJointSensitivity';
import {isParameterText} from './quantParameterValues';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const strings = (value: unknown, max: number): value is string[] => list(value, max) && value.every(row => typeof row === 'string');
const parameters = (value: unknown) => object(value) && Object.keys(value).length <= 30 && Object.values(value).every(row => number(row) || typeof row === 'boolean' || isParameterText(row));
const metric = (value: unknown) => value === null || object(value) && ['total_return', 'max_drawdown', 'turnover', 'entries', 'missing_signals', 'bars'].every(key => number(value[key]));
const spreads = (value: unknown) => object(value) && ['train', 'validation'].every(key => object(value[key]) && number(value[key].total_return) && number(value[key].max_drawdown));
export function readJointSensitivity(json?: string): QuantJointSensitivity | undefined {
    if (!json) return undefined;
    const value: unknown = JSON.parse(json);
    const fail = () => {throw new Error('联合参数分析版本或内容结构无法读取');};
    if (!object(value) || value.version !== 1 || !object(value.rule) || !list(value.families, 8) || !strings(value.limitations, 20) || !strings(value.excluded_combination_ids, 32)) return fail();
    const rule = value.rule;
    if (rule.version !== 1 || rule.minimum_dimensions !== 2 || rule.minimum_points !== 4 || rule.complete_cartesian_grid !== true || rule.categorical_mode !== 'fixed_context' || rule.interpolation_allowed !== false || !strings(rule.selection_partitions, 2)) return fail();
    if (!['return_spread_limit', 'drawdown_spread_limit', 'baseline_return_loss_limit', 'baseline_drawdown_increase_limit', 'minimum_signal_coverage', 'maximum_missing_fraction_spread'].every(key => number(rule[key])) || rule.requires_positive_return !== true || rule.requires_entries !== true) return fail();
    for (const family of value.families) {
        if (!object(family) || typeof family.seed_id !== 'string' || typeof family.name !== 'string' || !list(family.contexts, 49) || !list(family.excluded_variants, 49)) return fail();
        for (const excluded of family.excluded_variants) if (!object(excluded) || typeof excluded.attempt_id !== 'string' || typeof excluded.reason !== 'string') return fail();
        for (const context of family.contexts) {
            if (!object(context) || typeof context.context_id !== 'string' || !parameters(context.fixed_parameters) || !parameters(context.baseline_parameters) || !strings(context.axes, 30) || new Set(context.axes).size !== context.axes.length || typeof context.baseline_attempt_id !== 'string' || !number(context.compared_points) || !list(context.points, 49) || !list(context.regions, 4096) || !list(context.comparison_cells, 4096) || !['sampled_region', 'no_supported_region', 'incomplete_grid'].includes(String(context.status))) return fail();
            for (const point of context.points) {
                if (!object(point) || !parameters(point.parameters) || typeof point.attempt_id !== 'string' || typeof point.status !== 'string' || typeof point.reason !== 'string' || typeof point.comparable !== 'boolean' || typeof point.eligible !== 'boolean' || !strings(point.eligibility_reasons, 12) || !object(point.metrics) || !object(point.delta)) return fail();
                const metrics = point.metrics, delta = point.delta;
                if (!['train', 'validation'].every(part => metric(metrics[part]) && metric(delta[part]))) return fail();
            }
            for (const region of [...context.regions, ...context.comparison_cells]) {
                if (!object(region) || !object(region.sampled_values) || !strings(region.attempt_ids, 49) || !spreads(region.spreads) || typeof region.includes_baseline !== 'boolean') return fail();
                const axes = Object.entries(region.sampled_values);
                const names = context.axes;
                if (axes.length !== names.length || axes.some(([name, values]) => !names.includes(name) || !list(values, 49) || !values.length || !values.every(number) || new Set(values).size !== values.length)) return fail();
                const lengths = axes.map(([, values]) => (values as number[]).length);
                if (lengths.filter(length => length > 1).length < 2 || lengths.reduce((a, b) => a * b, 1) !== region.attempt_ids.length || new Set(region.attempt_ids).size !== region.attempt_ids.length) return fail();
            }
        }
    }
    return value as unknown as QuantJointSensitivity;
}
