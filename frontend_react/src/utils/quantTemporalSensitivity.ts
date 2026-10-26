import {isParameterText} from './quantParameterValues';
import type {QuantTemporalSensitivity, TemporalParameterGroup, TemporalRegion} from '../types/api/quantTemporalSensitivity';
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const strings = (value: unknown, max: number): value is string[] => list(value, max) && value.every(row => typeof row === 'string');
const parameters = (value: unknown) => object(value) && Object.values(value).every(row => number(row) || typeof row === 'boolean' || isParameterText(row));
const fail = (): never => {throw new Error('跨窗口参数证据版本或完整性无法读取');};
const status = (group: {regions: unknown[]; comparison_regions: unknown[]}) => group.regions.length ? 'sampled_region' : group.comparison_regions.length ? 'no_supported_region' : 'insufficient_comparison';

function region(value: unknown, axes: string[], minimum: number, dimensions: number): TemporalRegion {
    if (!object(value) || Object.keys(value).length !== axes.length) return fail();
    for (const name of axes) {
        const levels = value[name];
        if (!list(levels, 49) || !levels.length || !levels.every(number) || levels.some((row, index) => index > 0 && row <= (levels[index - 1] as number))) return fail();
    }
    const result = value as TemporalRegion;
    const sizes = axes.map(name => result[name].length);
    if (sizes.reduce((a, b) => a * b, 1) < minimum || sizes.filter(size => size > 1).length < dimensions) return fail();
    return result;
}

function group(value: unknown, axes: string[], total: number, inner: number, single: boolean): TemporalParameterGroup {
    if (!object(value) || !list(value.windows, 20) || value.windows.length !== total || !list(value.regions, 4096) || !list(value.comparison_regions, 4096)) return fail();
    for (const [index, row] of value.windows.entries()) {
        if (!object(row) || row.outer_fold !== Math.floor(index / inner) + 1 || row.inner_fold !== index % inner + 1 || typeof row.baseline_attempt_id !== 'string' || !list(row.points, 49) || !list(row.supported_values, 4096) || !object(row.ranges)) return fail();
        for(const part of ['train','validation']) {const range=row.ranges[part];if(!(range===null || (object(range) && typeof range.start==='string' && typeof range.end==='string')))return fail();}
        const keys = new Set<string>();
        for (const point of row.points) {
            if (!object(point) || !(single ? number(point.value) : parameters(point.value)) || typeof point.attempt_id !== 'string' || typeof point.status !== 'string' || typeof point.reason !== 'string' || typeof point.comparable !== 'boolean' || typeof point.eligible !== 'boolean' || !strings(point.eligibility_reasons, 12) || !object(point.metrics)) return fail();
            const parameterValues = point.value;
            if (!single && (!object(parameterValues) || !axes.every(name => number(parameterValues[name])))) return fail();
            const coordinate = single ? [point.value] : axes.map(name => (point.value as Record<string, unknown>)[name]);
            if (keys.has(JSON.stringify(coordinate))) return fail();
            keys.add(JSON.stringify(coordinate));
            for (const part of ['train', 'validation']) {
                const metric = point.metrics[part];
                if (!(metric === null || (object(metric) && number(metric.total_return) && number(metric.max_drawdown)))) return fail();
            }
            if (point.comparable && (!point.attempt_id || point.status !== 'evaluated' || !row.baseline_attempt_id || !point.metrics.train || !point.metrics.validation)) return fail();
            if (point.eligible && (!point.comparable || point.eligibility_reasons.length)) return fail();
            const measurements=point.metrics;
            if (point.eligible && ['train', 'validation'].some(part => {const metric=measurements[part];return !object(metric) || !number(metric.total_return) || metric.total_return<=0;})) return fail();
        }
        row.supported_values.forEach(item => region(item, axes, single ? 3 : 4, single ? 1 : 2));
    }
    const result = value as unknown as TemporalParameterGroup;
    for(const window of result.windows) if(window.points.some(point=>point.comparable)) {
        const reference=window.points.find(point=>point.attempt_id===window.baseline_attempt_id && point.comparable);
        const expected=single?value.baseline_value:value.baseline_parameters;
        if(!reference || (single ? reference.value!==expected : !object(reference.value) || !object(expected) || Object.keys(expected).length!==Object.keys(reference.value).length || !Object.entries(expected).every(([name,item])=>(reference.value as Record<string,unknown>)[name]===item)))return fail();
    }
    for (const [field, stable] of [['comparison_regions', false], ['regions', true]] as const) {
        for (const item of result[field]) {
            region(item, axes, single ? 3 : 4, single ? 1 : 2);
            const count = axes.reduce((product, name) => product * item[name].length, 1);
            for (const window of result.windows) {
                const points = window.points.filter(point => axes.every(name => item[name].includes(single ? point.value as number : (point.value as Record<string, number>)[name])));
                if (points.length !== count || points.some(point => !point[stable ? 'eligible' : 'comparable'])) return fail();
                if (stable && !window.supported_values.some(parent => axes.every(name => item[name].every(level => parent[name].includes(level))))) return fail();
            }
        }
    }
    if (value.status !== status(result)) return fail();
    return result;
}

export function readTemporalSensitivity(json?: string): QuantTemporalSensitivity | undefined {
    if (!json) return undefined;
    const value: unknown = JSON.parse(json);
    if (value === null) return undefined;
    if (!object(value) || value.version !== 1 || value.method !== 'all-planned-inner-sampled-regions-1' || !Number.isInteger(value.outer_folds) || !Number.isInteger(value.inner_folds) || !number(value.outer_folds) || value.outer_folds < 2 || value.outer_folds > 5 || !number(value.inner_folds) || value.inner_folds < 2 || value.inner_folds > 4 || value.planned_windows !== value.outer_folds * value.inner_folds || value.maximum_score_without_common_region !== 2 || !list(value.families, 8) || !strings(value.limitations, 20) || !strings(value.excluded_combination_ids, 32)) return fail();
    for (const rule of [value.axis_rule, value.joint_rule]) if (!object(rule) || rule.version !== 1 || !['minimum_points', 'return_spread_limit', 'drawdown_spread_limit', 'baseline_return_loss_limit', 'baseline_drawdown_increase_limit', 'minimum_signal_coverage', 'maximum_missing_fraction_spread'].every(key => number(rule[key])) || rule.interpolation_allowed !== false) return fail();
    for (const family of value.families) {
        if (!object(family) || typeof family.seed_id !== 'string' || typeof family.name !== 'string' || !parameters(family.baseline_parameters) || !list(family.axes, 16) || !list(family.contexts, 17) || !list(family.excluded_variants, 160)) return fail();
        for (const axis of family.axes) {
            if (!object(axis) || typeof axis.parameter !== 'string' || !number(axis.baseline_value)) return fail();
            group(axis, [axis.parameter], value.planned_windows as number, value.inner_folds, true);
        }
        for (const context of family.contexts) {
            if (!object(context) || typeof context.context_id !== 'string' || !parameters(context.fixed_parameters) || !parameters(context.baseline_parameters) || !strings(context.axes, 16) || context.axes.length < 2 || new Set(context.axes).size !== context.axes.length) return fail();
            group(context, context.axes, value.planned_windows as number, value.inner_folds, false);
        }
    }
    const typed = value as unknown as QuantTemporalSensitivity;
    const groups = typed.families.flatMap(family => [...family.axes, ...family.contexts]);
    const expected = groups.some(row => row.regions.length) ? 'sampled_region' : groups.some(row => row.comparison_regions.length) ? 'no_supported_region' : 'insufficient_comparison';
    if (value.status !== expected) return fail();
    return typed;
}
