import {defaultWalkForward, temporalSnapshot} from '../../utils/quantTemporal';

/** Artificial capability record only; the local model is never called. */
export const mockPlanningCapabilities = () => ({version: 1, method: 'bounded-temporal-planning-1',
    walk_forward_versions: [1, 2], outer_folds: [2, 5], inner_folds: [2, 4], modes: ['expanding', 'rolling'],
    minimum_intervals: {train: 20, validation: 5, test: 5}, maximum_rows: 20000, maximum_attempts: 32, maximum_seconds: 60,
    selection: 'inner_mean_train_pareto_then_mean_validation_return_minus_drawdown_v2',
    scope: 'design_capability_not_market_data_execution_authority_or_validation'});

export function applyNestedMockPlan(data: {name: string; data_requirement: string; hypothesis: string; config: Record<string, unknown>}) {
    Object.assign(data.config, {walk_forward: temporalSnapshot({...defaultWalkForward, version: 2, innerFolds: 3, warmupBars: 25})});
    data.name = 'AI 方案人工样例 · 多内层参数验证';
    data.hypothesis = '人工样例：用多段内层窗口比较邻近参数，再评价后续外层；尚未计算或验证。';
    data.data_requirement = '至少133根同口径OHLC：2+25+40+3×10+3×10+2×(2+1)。标的和频率需要实际选择，本地样例没有行情验证。';
}
