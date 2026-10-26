/** Explicit artificial local projection; no prices are computed or recommended. */
import type {QuantTemporalSensitivity, TemporalParameterWindow, TemporalRegion} from '../../types/api/quantTemporalSensitivity';
import type {QuantSensitivity, SensitivityPoint, SensitivityMetric} from '../../types/api/quantSensitivity';
import type {QuantJointSensitivity} from '../../types/api/quantJointSensitivity';
import type {MockExperiment} from './experiments';
import {mockSensitivity} from './sensitivity';
import {mockJointSensitivity} from './jointSensitivity';
interface Attempt {id: string; fold: number; status: string; metrics: Record<string, SensitivityMetric>; inner_evaluation?: {folds: {number: number; metrics: Record<string, SensitivityMetric & {start:string;end:string}>}[]}}
const compact = (point: SensitivityPoint | (Omit<SensitivityPoint, 'value'> & {parameters: Record<string, number | boolean | string>})) => ({...point,
    value: 'value' in point ? point.value : point.parameters,
    metrics: Object.fromEntries(Object.entries(point.metrics).map(([part, metric]) => [part, metric ? {total_return: metric.total_return, max_drawdown: metric.max_drawdown} : null])) as TemporalParameterWindow['points'][number]['metrics']});
const status = (regions: TemporalRegion[], comparisons: TemporalRegion[]) => regions.length ? 'sampled_region' as const : comparisons.length ? 'no_supported_region' as const : 'insufficient_comparison' as const;
function intersect(groups: TemporalRegion[][], minimum: number, dimensions: number): TemporalRegion[] {
    const maximal = (values: TemporalRegion[]) => values.filter((row, index) => !values.some((other, next) => next !== index && Object.keys(row).every(name => row[name].every(value => other[name]?.includes(value))) && (JSON.stringify(row) !== JSON.stringify(other) || next < index)));
    let result = groups[0] || [];
    for (const group of groups.slice(1)) {
        result = maximal(result.flatMap(left => group.flatMap(right => {
            const overlap = Object.fromEntries(Object.entries(left).map(([name, values]) => [name, values.filter(value => right[name]?.includes(value))]));
            const sizes = Object.values(overlap).map(values => values.length);
            return sizes.every(Boolean) && sizes.filter(size => size > 1).length >= dimensions && sizes.reduce((a, b) => a * b, 1) >= minimum ? [overlap] : [];
        })));
    }
    return maximal(result);
}
export function mockTemporalSensitivity(record: MockExperiment): string {
    const policy = record.input.config.walkForward;
    if (policy?.version !== 2) return 'null';
    const attempts = JSON.parse(record.data.attemptsJson || '[]') as Attempt[];
    const windows = Array.from({length: policy.folds * policy.innerFolds!}, (_, index) => {
        const outer = Math.floor(index / policy.innerFolds!) + 1, inner = index % policy.innerFolds! + 1;
        const projected = attempts.filter(row => row.fold === outer).map(row => {
            const metrics = row.inner_evaluation?.folds.find(item => item.number === inner)?.metrics || {};
            return {...row, metrics, status: row.status === 'evaluated' && (!metrics.train || !metrics.validation) ? 'not_run' : row.status};
        });
        const scoped: MockExperiment = {...record, input: {...record.input, config: {...record.input.config, walkForward: undefined}}, data: {...record.data, attemptsJson: JSON.stringify(projected)}};
        const ranges=Object.fromEntries(['train','validation'].map(part=>{const metric=projected.find(row=>row.metrics[part])?.metrics[part];return [part,metric?{start:metric.start,end:metric.end}:null];})) as TemporalParameterWindow['ranges'];
        return {outer_fold: outer, inner_fold: inner, ranges, axis: JSON.parse(mockSensitivity(scoped)) as QuantSensitivity, joint: JSON.parse(mockJointSensitivity(scoped)) as QuantJointSensitivity};
    });
    const first = windows[0];
    const families: QuantTemporalSensitivity['families'] = first.axis.families.map((family, index) => ({seed_id: family.seed_id, name: family.name, baseline_parameters: family.baseline_parameters, excluded_variants: [],
        axes: family.axes.filter(axis => axis.points.length > 1).map(axis => {
            const evidence = windows.map(window => {
                const source = window.axis.families[index], current = source.axes.find(row => row.parameter === axis.parameter)!;
                return {outer_fold: window.outer_fold, inner_fold: window.inner_fold, ranges:window.ranges, baseline_attempt_id: source.baseline_attempt_id,
                    points: current.points.map(compact), supported_values: current.regions.map(row => ({[axis.parameter]: row.sampled_values}))};
            });
            // The existing artificial fixture never certifies positive regions.
            const comparisons = intersect(evidence.map(window => window.points.length >= 3 && window.points.every(point => point.comparable) ? [{[axis.parameter]: window.points.map(point => point.value as number)}] : []), 3, 1);
            return {parameter: axis.parameter, baseline_value: axis.baseline_value, windows: evidence, comparison_regions: comparisons, regions: [], status: status([], comparisons)};
        }), contexts: first.joint.families[index].contexts.filter(context => context.axes.length >= 2).map(context => {
            const groups = windows.map(window => ({window, group: window.joint.families[index].contexts.find(row => row.context_id === context.context_id)!}));
            const comparisons = intersect(groups.map(({group}) => group.comparison_cells.map(row => row.sampled_values)), 4, 2);
            return {context_id: context.context_id, fixed_parameters: context.fixed_parameters, axes: context.axes, baseline_parameters: context.baseline_parameters,
                windows: groups.map(({window, group}) => ({outer_fold: window.outer_fold, inner_fold: window.inner_fold, ranges:window.ranges, baseline_attempt_id: group.baseline_attempt_id, points: group.points.map(compact), supported_values: []})),
                comparison_regions: comparisons, regions: [], status: status([], comparisons)};
        })}));
    const groups = families.flatMap(family => [...family.axes, ...family.contexts]);
    const value: QuantTemporalSensitivity = {version: 1, method: 'all-planned-inner-sampled-regions-1', outer_folds: policy.folds, inner_folds: policy.innerFolds!, planned_windows: windows.length,
        status: groups.some(row => row.comparison_regions.length) ? 'no_supported_region' : 'insufficient_comparison', axis_rule: first.axis.rule, joint_rule: first.joint.rule,
        maximum_score_without_common_region: 2, families, excluded_combination_ids: first.axis.excluded_combination_ids,
        limitations: ['人工 local 样例，未计算行情、调用模型或验证真实参数。', '逐窗完整对照和共同候选分开，失败与缺测保留，窗口不属于独立样本。', '本样例不产生稳定区域推荐；真实筛选由后端固定规则计算。']};
    return JSON.stringify(value);
}
