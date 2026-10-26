/** Synthetic projection for the existing two-point local fixture. No market computation. */
import type {QuantSensitivity, SensitivityMetric, SensitivityPoint} from '../../types/api/quantSensitivity';
import type {MockExperiment} from './experiments';
export function mockSensitivity(record: MockExperiment): string {
    let attempts = JSON.parse(record.data.attemptsJson || '[]') as {fold?: number; id: string; parents: string[]; operation: string; requested_parameters: Record<string, number | boolean | string>; status: string; reason: string; metrics: Record<'train' | 'validation', SensitivityMetric | undefined>}[];
    if (record.input.config.walkForward) attempts = attempts.filter(row => row.fold === Math.max(0, ...attempts.map(item => item.fold || 0)));
    const data: QuantSensitivity = {version: 1, rule: {version: 1, minimum_points: 3, return_spread_limit: .02, drawdown_spread_limit: .02, baseline_return_loss_limit: .02, baseline_drawdown_increase_limit: .02, requires_positive_return: true, requires_entries: true, minimum_signal_coverage: .9, maximum_missing_fraction_spread: .05, selection_partitions: ['train', 'validation'], interpolation_allowed: false},
        limitations: ['人工构造的 local 展示样例，未计算导入行情；不用于推荐真实参数。', '未执行、失败与多参数变体不构成稳定区段；不使用留出结果。'], families: [], excluded_combination_ids: attempts.filter(row => !['source_candidate', 'parameter_variant'].includes(row.operation)).map(row => row.id)};
    if (record.input.config.walkForward) data.limitations.push('参数归因仅比较最后已启动折，不跨折合并。');
    if (record.input.config.walkForward?.version === 2) data.limitations.push('嵌套搜索仅描述最后外折最后已启动的内层窗口，实际选择使用全部内层汇总。');
    for (const seed of record.input.seeds) {
        const base = attempts.find(row => row.operation === 'source_candidate' && row.parents[0] === seed.candidateId);
        const baseline = Object.fromEntries(seed.parameters.map(row => [row.name, row.value]));
        const family: QuantSensitivity['families'][number] = {seed_id: seed.candidateId, name: record.data.name, baseline_attempt_id: base?.id || '', baseline_parameters: baseline, axes: [], excluded_variants: []};
        const names = new Set(seed.variants.flatMap(values => values.filter(row => row.value !== baseline[row.name]).map(row => row.name)));
        for (const name of names) {
            const baselineValue = baseline[name];
            if (typeof baselineValue !== 'number') continue;
            const values = new Set([baselineValue, ...seed.variants.filter(group => group.filter(row => row.value !== baseline[row.name]).length === 1).flatMap(group => group.filter(row => row.name === name && typeof row.value === 'number').map(row => row.value as number))]);
            for (const attempt of attempts.filter(row => row.operation === 'parameter_variant' && row.parents[0] === base?.id)) {
                const changes = Object.keys(attempt.requested_parameters).filter(key => attempt.requested_parameters[key] !== baseline[key]);
                if (changes.length === 1 && changes[0] === name && typeof attempt.requested_parameters[name] === 'number') values.add(attempt.requested_parameters[name]);
            }
            const points: SensitivityPoint[] = [...values].sort((a, b) => a - b).map(value => {
                const attempt = value === baselineValue ? base : attempts.find(row => row.operation === 'parameter_variant' && row.parents[0] === base?.id && row.requested_parameters[name] === value);
                const point: SensitivityPoint = {value, attempt_id: attempt?.id || '', status: attempt?.status || 'not_run', reason: attempt?.reason || (attempt ? '' : '计划取值尚未执行'), metrics: {train: attempt?.metrics.train || null, validation: attempt?.metrics.validation || null}, delta: {train: null, validation: null}, comparable: attempt?.status === 'evaluated' && base?.status === 'evaluated', eligible: false, eligibility_reasons: ['人工样例不构成真实区段推荐']};
                for (const part of ['train', 'validation'] as const) {
                    const metric = point.metrics[part], reference = base?.metrics[part];
                    if (metric && reference) point.delta[part] = Object.fromEntries(Object.keys(reference).filter(key => typeof reference[key as keyof SensitivityMetric] === 'number').map(key => [key, metric[key as keyof SensitivityMetric] - reference[key as keyof SensitivityMetric]])) as unknown as SensitivityMetric;
                }
                return point;
            });
            family.axes.push({parameter: name, baseline_value: baselineValue, points, compared_points: points.filter(row => row.comparable).length, spreads: null, regions: [], status: 'insufficient_comparison'});
        }
        data.families.push(family);
    }
    return JSON.stringify(data);
}
