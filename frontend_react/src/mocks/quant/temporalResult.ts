/** Synthetic UI fixture only. The mock never calculates imported prices. */
import type {QuantExperimentInput} from '../../types/api/quantExperiment';
import {temporalWindows} from '../../utils/quantTemporal';
import type {MockFormulaSeed} from './formulaEvolution';
import {demoExperimentResult} from './experimentResult';

export function demoTemporalResult(input: QuantExperimentInput, start: string, end: string, rows: number, seeds: MockFormulaSeed[]) {
    const policy = input.config.walkForward!;
    const schedules = temporalWindows(rows, policy, input.config.gap);
    const attempts: (ReturnType<typeof demoExperimentResult>['attempts'][number] & {fold: number})[] = [];
    const date = (index: number) => new Date(Date.parse(start) + (Date.parse(end)-Date.parse(start))*index/(rows-1)).toISOString();
    const folds = schedules.map((window, index) => {
        const budget = Math.floor(input.config.maxCandidates / policy.folds) + Number(index < input.config.maxCandidates % policy.folds);
        const engine = input.config.strategy ? 'quant-local-search-5' : input.config.evolution ? 'quant-local-search-3' : 'quant-local-search-2';
        const demo = demoExperimentResult({...input, config: {...input.config, walkForward: undefined, maxCandidates: budget}}, date(window.partitions.holdout[0]), date(window.partitions.holdout[1]), engine, seeds);
        const offset = attempts.length, id = (value: string) => `attempt-${Number(value.replace('attempt-', '')) + offset}`;
        const remapped = demo.attempts.map(attempt => {
            const metrics = structuredClone(attempt.metrics);
            for (const name of ['train', 'validation'] as const) {
                const metric = metrics[name];
                if (metric) {metric.start = date(window.partitions[name][0]); metric.end = date(window.partitions[name][1]); metric.bars = window.partitions[name][1]-window.partitions[name][0];}
            }
            return {...attempt, metrics, id: id(attempt.id), fold: index+1, parents: attempt.operation === 'source_candidate' ? attempt.parents : attempt.parents.map(id)};
        });
        attempts.push(...remapped);
        return {...window, seed: (input.config.seed+index) % 2**32, max_candidates: budget, search_engine_version: engine,
            attempt_ids: remapped.map(attempt => attempt.id), frontier_ids: remapped.filter(attempt => attempt.status === 'evaluated').map(attempt => attempt.id),
            selected_id: id(demo.envelope.output.selected_id), holdout: demo.envelope.output.holdout, buy_hold_baseline: demo.envelope.output.buy_hold_baseline,
            holdout_status: 'excluded_from_this_fold_selection_prior_usage_unattested', stop_reason: 'generation_complete'};
    });
    const final = folds[folds.length-1], returns = folds.map(fold => fold.holdout.total_return);
    const output = {engine_version: input.config.strategy ? 'quant-local-search-6' : 'quant-local-search-4', attempts, selected_id: final.selected_id, frontier_ids: final.frontier_ids,
        holdout: final.holdout, buy_hold_baseline: final.buy_hold_baseline, stop_reason: 'generation_complete',
        walk_forward: {version: 1, folds, summary: {planned_folds: policy.folds, started_folds: folds.length, tested_folds: folds.length,
            positive_folds: returns.filter(value => value > 0).length, mean_test_return: returns.reduce((sum, value) => sum+value, 0)/returns.length,
            worst_test_return: Math.min(...returns), worst_test_drawdown: Math.max(...folds.map(fold => fold.holdout.max_drawdown)),
            mean_baseline_return: folds.reduce((sum, fold) => sum+fold.buy_hold_baseline.total_return, 0)/folds.length,
            aggregation: 'per_fold_flat_start_arithmetic_summary_v1'}},
        limitations: ['逐折指标、曲线与尝试均为人工构造的本地展示样例，未执行滚动搜索或计算导入行情。', '各折独立从空仓开始；均值不是连续组合收益。最后一折用于后续候选展示。']};
    return {attempts, envelope: {version: 1, status: 'completed', error: '', output, checkpoint_hashes: [], overlap_audit: {scope: 'same_collection_symbol_timeframe_requested_ranges', request_ids: [], total: 0, independent_holdout_proven: false}, local_demo: true}};
}
