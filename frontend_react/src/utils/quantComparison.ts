import type {QuantComparison, QuantComparisonPlan, QuantComparisonResult, QuantComparisonDifference, QuantComparisonDataset} from '../types/api/quantComparison';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const string = (value: unknown): value is string => typeof value === 'string';
const scalar = (value: unknown) => finite(value) || typeof value === 'boolean' || string(value);
const difference = (value: unknown): value is QuantComparisonDifference => object(value) && integer(value.index) && string(value.timestamp) &&
    ['left_missing', 'right_missing', 'value_mismatch'].includes(String(value.kind)) && [value.left, value.right].every(row => row === null || finite(row) || typeof row === 'boolean');
const counts = ['common_valid', 'left_missing', 'right_missing', 'both_missing', 'missing_mismatches', 'value_mismatches', 'within_tolerance'];
export const comparisonVerdicts = {pass: '样本内一致', fail: '发现差异', inconclusive: '证据不足'};
export const comparisonDifferenceKinds = {left_missing: '左侧缺失', right_missing: '右侧缺失', value_mismatch: '数值或信号差异'};
export function readComparison(comparison: QuantComparison): {plan: QuantComparisonPlan; result: QuantComparisonResult; dataset: QuantComparisonDataset} {
    const fail = (): never => {throw new Error('对照证据版本或内容结构无法读取');};
    let plan: unknown, result: unknown, dataset: unknown;
    try {plan = JSON.parse(comparison.planJson || ''); result = JSON.parse(comparison.resultJson || ''); dataset = JSON.parse(comparison.datasetJson || '');} catch {return fail();}
    if (!object(plan) || !object(result) || !object(dataset)) return fail();
    const policy = plan.policy, runtime = plan.runtime, n = result.counts;
    if (dataset.id !== comparison.datasetId || !integer(dataset.row_count) || !['id', 'name', 'content_hash', 'start', 'end', 'symbol', 'timeframe', 'timezone', 'price_adjustment', 'source'].every(key => string(dataset[key]))) return fail();
    if (plan.version !== 1 || plan.method !== 'controlled-output-comparison-v1' || plan.engine_version !== 'quant-controlled-expression-1' || !string(plan.name) ||
        plan.dataset_id !== comparison.datasetId || !string(plan.dataset_hash) || !object(policy) || policy.version !== 1 ||
        ![policy.absolute_tolerance, policy.relative_tolerance].every(value => finite(value) && value >= 0 && value <= .001) ||
        !integer(policy.warmup_bars) || policy.warmup_bars > 2000 || !object(runtime) || !['python', 'numpy', 'pandas'].every(key => string(runtime[key]))) return fail();
    for (const [key, identity] of [['left', comparison.leftId], ['right', comparison.rightId]] as const) {
        const side = plan[key];
        if (!object(side) || side.id !== identity || !object(side.candidate) || !string(side.candidate_hash) || !string(side.source_id) || !string(side.report_id) || !string(side.source_hash) || !string(side.report_hash) ||
            !object(side.bindings) || !Object.values(side.bindings).every(value => string(value) && ['open', 'high', 'low', 'close', 'volume'].includes(value)) ||
            !object(side.parameters) || !Object.values(side.parameters).every(scalar)) return fail();
    }
    if (result.version !== 1 || result.method !== 'controlled-output-comparison-v1' || result.claim !== 'fixed_sample_controlled_outputs_not_platform_or_global_equivalence' ||
        !Object.prototype.hasOwnProperty.call(comparisonVerdicts, String(result.status)) || result.status !== comparison.verdict || !['completed', 'timed_out'].includes(String(result.evaluation_status)) ||
        !object(n) || !['total_rows', 'warmup_rows', 'compared_rows'].every(key => integer(n[key])) ||
        !counts.every(key => n[key] === null || integer(n[key])) || !['start', 'end', 'comparison_start'].every(key => string(result[key])) ||
        !object(result.output_hashes) || !string(result.output_hashes.left) || !string(result.output_hashes.right) || !string(result.classification_hash) ||
        ![result.max_abs_error, result.max_relative_error].every(row => row === null || string(row) && /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(row)) ||
        !(result.first_difference === null || difference(result.first_difference)) || !Array.isArray(result.differences) || result.differences.length > 12 || !result.differences.every(difference) ||
        !Array.isArray(result.limitations) || !result.limitations.every(string)) return fail();
    if (dataset.row_count !== n.total_rows || dataset.content_hash !== plan.dataset_hash || n.warmup_rows !== policy.warmup_bars || result.start !== dataset.start || result.end !== dataset.end ||
        (n.warmup_rows as number) + (n.compared_rows as number) !== n.total_rows || (n.compared_rows as number) < 30 || counts.some(key => typeof n[key] === 'number' && n[key] > (n.compared_rows as number))) return fail();
    if (result.evaluation_status === 'completed' && counts.some(key => n[key] === null)) return fail();
    if (result.evaluation_status === 'timed_out' && result.status !== 'inconclusive') return fail();
    if (result.status === 'pass' && ((n.common_valid as number) < 30 || n.missing_mismatches !== 0 || n.value_mismatches !== 0 || n.within_tolerance !== n.common_valid)) return fail();
    if (result.differences.some(row => row.index < (n.warmup_rows as number) || row.index >= (n.total_rows as number))) return fail();
    return {plan: plan as unknown as QuantComparisonPlan, result: result as unknown as QuantComparisonResult, dataset: dataset as unknown as QuantComparisonDataset};
}
