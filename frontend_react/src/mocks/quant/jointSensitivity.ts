/** Fixed display fixture for the explicit local joint-parameter example, not a backtest. */
import type {JointContext, JointPoint, JointRegion, QuantJointSensitivity} from '../../types/api/quantJointSensitivity';
import type {SensitivityMetric} from '../../types/api/quantSensitivity';
import type {MockExperiment} from './experiments';
import {mockSensitivity} from './sensitivity';
import {readSensitivity} from '../../utils/quantSensitivity';
export function mockJointSensitivity(record: MockExperiment): string {
    const single = readSensitivity(mockSensitivity(record))!;
    const data: QuantJointSensitivity = {version: 1, rule: {...single.rule, minimum_points: 4, minimum_dimensions: 2, complete_cartesian_grid: true, categorical_mode: 'fixed_context'},
        limitations: ['人工构造的 local 联合参数展示，不计算行情或真实稳定区域。', '当前样例只演示两个数值参数的四点完整网格；失败与未执行点仍可查。'], families: [], excluded_combination_ids: single.excluded_combination_ids};
    let attempts = JSON.parse(record.data.attemptsJson || '[]') as {id: string; fold?: number; operation: string; parents: string[]; requested_parameters: Record<string, number | string | boolean> | null; status: string; reason: string; metrics: Record<'train' | 'validation', SensitivityMetric | undefined>}[];
    if (record.input.config.walkForward) {
        const last = Math.max(0, ...attempts.map(row => row.fold || 0)); attempts = attempts.filter(row => row.fold === last);
        data.limitations.push(`仅展示最后已启动的第 ${last} 折，不跨折合并。`);
    }
    for (const seed of record.input.seeds) {
        const baseline = Object.fromEntries(seed.parameters.map(row => [row.name, row.value]));
        const base = attempts.find(row => row.operation === 'source_candidate' && row.parents[0] === seed.candidateId);
        const numeric = Object.keys(baseline).filter(name => typeof baseline[name] === 'number');
        const planned = [baseline, ...seed.variants.map(group => Object.fromEntries(group.map(row => [row.name, row.value])))];
        const unique = planned.filter((row, index) => planned.findIndex(other => Object.keys(baseline).every(key => other[key] === row[key])) === index);
        const axes = numeric.filter(name => new Set(unique.map(row => row[name])).size > 1);
        const fixed = Object.fromEntries(Object.entries(baseline).filter(([key]) => !numeric.includes(key)));
        const points: JointPoint[] = unique.map(parameters => {
            const attempt = attempts.find(row => row.requested_parameters && (row === base || row.operation === 'parameter_variant' && row.parents[0] === base?.id) && Object.keys(baseline).every(key => row.requested_parameters![key] === parameters[key]));
            const comparable = attempt?.status === 'evaluated' && base?.status === 'evaluated';
            return {parameters, attempt_id: attempt?.id || '', status: attempt?.status || 'not_run', reason: attempt?.reason || (attempt ? '' : '计划组合尚未执行'), comparable, eligible: comparable,
                eligibility_reasons: comparable ? [] : ['人工样例中此组合未完成，不能补齐'], metrics: {train: attempt?.metrics.train || null, validation: attempt?.metrics.validation || null}, delta: {train: null, validation: null}};
        });
        const sampled = Object.fromEntries(axes.map(name => [name, [...new Set(points.map(point => point.parameters[name] as number))].sort((a, b) => a - b)]));
        const complete = axes.length === 2 && points.length === 4 && Object.values(sampled).every(values => values.length === 2) && points.every(point => point.comparable && Object.keys(fixed).every(name => point.parameters[name] === fixed[name]));
        const region: JointRegion = {sampled_values: sampled, attempt_ids: points.map(point => point.attempt_id), spreads: {train: {total_return: 0, max_drawdown: 0}, validation: {total_return: 0, max_drawdown: 0}}, includes_baseline: true};
        const context: JointContext = {context_id: 'local-fixed-context', fixed_parameters: fixed, axes, baseline_parameters: baseline, baseline_attempt_id: base?.id || '', points, compared_points: points.filter(point => point.comparable).length, comparison_cells: complete ? [region] : [], regions: complete ? [region] : [], status: complete ? 'sampled_region' : 'incomplete_grid'};
        data.families.push({seed_id: seed.candidateId, name: record.data.name, contexts: [context], excluded_variants: []});
    }
    return JSON.stringify(data);
}
