import {isParameterText} from './quantParameterValues';
import type {QuantSensitivity} from '../types/api/quantSensitivity';
export function readSensitivity(json?: string): QuantSensitivity | undefined {
    if (!json) return undefined;
    const value: unknown = JSON.parse(json);
    const object = (item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item);
    const number = (item: unknown): item is number => typeof item === 'number' && Number.isFinite(item);
    const list = (item: unknown, max: number): item is unknown[] => Array.isArray(item) && item.length <= max;
    const strings = (item: unknown, max: number) => list(item, max) && item.every(row => typeof row === 'string');
    const fail = () => {throw new Error('参数敏感度版本或内容结构无法读取');};
    const metric = (item: unknown) => item === null || (object(item) && ['total_return', 'max_drawdown', 'turnover', 'entries', 'missing_signals', 'bars'].every(key => number(item[key])));
    const spreads = (item: unknown) => object(item) && ['train', 'validation'].every(part => object(item[part]) && number(item[part].total_return) && number(item[part].max_drawdown));
    if (!object(value) || value.version !== 1 || !object(value.rule) || value.rule.version !== 1 || !list(value.families, 8) || !strings(value.limitations, 20) || !strings(value.excluded_combination_ids, 32)) return fail();
    const rule = value.rule;
    if (!['minimum_signal_coverage', 'maximum_missing_fraction_spread', 'minimum_points', 'return_spread_limit', 'drawdown_spread_limit', 'baseline_return_loss_limit', 'baseline_drawdown_increase_limit'].every(key => number(rule[key]))) return fail();
    for (const family of value.families) {
        if (!object(family) || typeof family.seed_id !== 'string' || typeof family.name !== 'string' || !object(family.baseline_parameters) || !Object.values(family.baseline_parameters).every(item => number(item) || typeof item === 'boolean' || isParameterText(item)) || !list(family.axes, 30) || !list(family.excluded_variants, 48)) return fail();
        for (const excluded of family.excluded_variants) if (!object(excluded) || typeof excluded.attempt_id !== 'string' || typeof excluded.reason !== 'string') return fail();
        for (const axis of family.axes) {
            if (!object(axis) || typeof axis.parameter !== 'string' || !number(axis.baseline_value) || !number(axis.compared_points) || !['sampled_region', 'insufficient_comparison', 'no_supported_region'].includes(String(axis.status)) || !list(axis.points, 49) || !list(axis.regions, 49) || !(axis.spreads === null || spreads(axis.spreads))) return fail();
            for (const point of axis.points) {
                if (!object(point) || !number(point.value) || typeof point.attempt_id !== 'string' || typeof point.status !== 'string' || typeof point.reason !== 'string' || typeof point.comparable !== 'boolean' || typeof point.eligible !== 'boolean' || !strings(point.eligibility_reasons, 12) || !object(point.metrics) || !object(point.delta)) return fail();
                const metrics = point.metrics, delta = point.delta;
                if (!['train', 'validation'].every(part => metric(metrics[part]) && metric(delta[part]))) return fail();
            }
            for (const region of axis.regions) if (!object(region) || !list(region.sampled_values, 49) || !region.sampled_values.every(number) || !strings(region.attempt_ids, 49) || typeof region.includes_baseline !== 'boolean' || !spreads(region.spreads)) return fail();
        }
    }
    return value as unknown as QuantSensitivity;
}
