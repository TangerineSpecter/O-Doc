/** Artificial comparison fixtures. Never evaluates source code or historical bars. */
import type {QuantDataset} from '../../types/api/quantDataset';
import type {QuantFactorCandidate} from '../../types/api/quant';
import type {QuantComparisonPolicy, QuantComparisonResult} from '../../types/api/quantComparison';

export const comparisonMethod = 'controlled-output-comparison-v1';
const artificial = '人工构造的本地对照样例，未计算历史行情、未执行源码或验证平台等价性。';
export function mockComparisonResult(left: QuantFactorCandidate, right: QuantFactorCandidate, dataset: QuantDataset, policy: QuantComparisonPolicy, marker: string, comparisonStart: string): QuantComparisonResult {
    const n = dataset.rowCount - policy.warmupBars;
    const timeout = marker.includes('LOCAL_COMPARISON_TIMEOUT');
    const insufficient = marker.includes('LOCAL_COMPARISON_FULLY_MISSING') || marker.includes('LOCAL_COMPARISON_INCONCLUSIVE');
    const failed = !insufficient && marker.includes('LOCAL_COMPARISON_FAIL') && left.data.outputType === right.data.outputType;
    const pass = !insufficient && !failed && marker.includes('LOCAL_COMPARISON_PASS') && left.data.outputType === right.data.outputType &&
        left.data.units === right.data.units && !['', 'unknown', '未知', '未说明'].includes(left.data.units.trim().toLowerCase()) && left.data.role === right.data.role;
    const known = failed || pass;
    // Only timestamp labels are shown. No output or comparison statistic is derived from the CSV.
    const difference = failed ? {index: policy.warmupBars, timestamp: comparisonStart, left: left.data.outputType === 'boolean_series' ? true : 1,
        right: right.data.outputType === 'boolean_series' ? false : 2, kind: 'value_mismatch' as const} : null;
    return {version: 1, local_demo: true, method: comparisonMethod, claim: 'fixed_sample_controlled_outputs_not_platform_or_global_equivalence',
        status: timeout ? 'inconclusive' : failed ? 'fail' : pass ? 'pass' : 'inconclusive', evaluation_status: timeout ? 'timed_out' : 'completed',
        counts: {total_rows: dataset.rowCount, warmup_rows: policy.warmupBars, compared_rows: n,
            common_valid: timeout ? null : known ? n : 0, left_missing: timeout ? null : known ? 0 : n, right_missing: timeout ? null : known ? 0 : n,
            both_missing: timeout ? null : known ? 0 : n, missing_mismatches: timeout ? null : 0,
            value_mismatches: timeout ? null : failed ? 1 : 0, within_tolerance: timeout ? null : known ? n - (failed ? 1 : 0) : 0},
        start: dataset.start, end: dataset.end, comparison_start: comparisonStart,
        output_hashes: {left: timeout ? '' : 'local-demo-artificial-left', right: timeout ? '' : 'local-demo-artificial-right'},
        classification_hash: timeout ? '' : 'local-demo-artificial-classifications',
        max_abs_error: timeout || !known || left.data.outputType === 'boolean_series' ? null : failed ? '1' : '0',
        max_relative_error: timeout || !known || left.data.outputType === 'boolean_series' ? null : failed ? '0.5' : '0',
        first_difference: timeout ? null : difference, differences: timeout || !difference ? [] : [difference],
        limitations: [artificial, '仅限固定候选、实际参数、输入映射、行情与容差合同；不能证明全局等价或可实盘互换。',
            timeout ? '人工超时样例，逐行比较未完成，不可用于合并。' : pass ? '原始资料中的 LOCAL_COMPARISON_PASS 显式标记仅用于本地交互演示。' : failed ? 'LOCAL_COMPARISON_FAIL 显式生成一条人工差异，未计算真实输出。' : '未提供人工通过标记或共同有效输出不足30行，结果为证据不足。']};
}
