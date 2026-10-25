import {demoExecution} from './strategyExecution';
/** Explicitly synthetic display fixture; never a calculation of the imported CSV. */
import {mockFormulaEvolution, type MockFormulaSeed} from './formulaEvolution';
import type {transformationSnapshot} from '../../utils/quantEvolution';
import type {QuantExperimentInput} from '../../types/api/quantExperiment';
export function demoExperimentResult(input: QuantExperimentInput, start: string, end: string, engineVersion = 'quant-local-search-2', seeds: MockFormulaSeed[] = []) {
    const dates = Array.from({length: 6}, (_, index) => new Date(Date.parse(start) + (Date.parse(end) - Date.parse(start)) * index / 5).toISOString());
    const metric = (equities: number[], withCurve = false, baseline = false) => {
        if (input.config.strategy) equities = equities.map(value => 1 + (value - 1) * input.config.strategy!.positionFraction);
        let peak = 1, drawdown = 0;
        for (const value of equities) {peak = Math.max(peak, value); drawdown = Math.max(drawdown, 1 - value / peak);}
        return {...(input.config.strategy ? {execution: demoExecution(input.config.strategy, equities[equities.length - 1] - 1, dates, withCurve, baseline, input.config.feeBps, input.config.slippageBps)} : {}), total_return: equities[equities.length - 1] - 1, max_drawdown: drawdown, entries: input.config.strategy ? baseline ? 1 : Math.min(2, input.config.strategy.maxEntries) : 2, turnover: input.config.strategy ? 2 * (baseline ? 1 : Math.min(2, input.config.strategy.maxEntries)) : 4, exposure_fraction: .8, missing_signals: 0, bars: 5, start: dates[0], end: dates[5],
            ...(withCurve ? {curve: equities.map((equity, index) => ({timestamp: dates[index], equity})), returns: equities.slice(1).map((equity, index) => equity / equities[index] - 1)} : {})};
    };
    type Metric = ReturnType<typeof metric>;
    const attempts: {id: string; parents: string[]; operation: string; generation: number; requested_parameters: Record<string, number | boolean | string> | null;
        status: string; reason: string; metrics: {train?: Metric; validation?: Metric}; transformation?: ReturnType<typeof transformationSnapshot>;
        recipe: {expression: Record<string, unknown>; parameters: Record<string, number | boolean | string>; bindings?: Record<string, string>; output_type?: string; units?: string}; complexity: number}[] = input.seeds.map((seed, index) => ({id: `attempt-${index + 1}`, parents: [seed.candidateId], operation: 'source_candidate', generation: 0, requested_parameters: Object.fromEntries(seed.parameters.map(row => [row.name, row.value])), status: 'evaluated', reason: '',
        metrics: {train: metric([1, 1.02, .99, 1.03, 1.02, 1.05]), validation: metric([1, 1.01, 1, 1.03, 1.02, 1.04])},
        recipe: {expression: {op: 'input', name: 'local_demo_signal'}, parameters: {}}, complexity: 1}));
    const first = input.seeds[0];
    const jointDemo = seeds[0]?.candidate.name === '周期与阈值 · 联合参数演示';
    const arithmeticDemo = seeds[0]?.candidate.name === '算术参数 · 本地演示候选';
    const completeVariants = jointDemo || arithmeticDemo;
    if (!completeVariants && first.variants[0] && attempts.length < input.config.maxCandidates - (input.config.evolution ? 1 : 0)) attempts.push({id: `attempt-${attempts.length + 1}`, parents: ['attempt-1'], operation: 'parameter_variant', generation: 0,
        requested_parameters: Object.fromEntries(first.variants[0].map(row => [row.name, 0])), status: 'rejected', reason: '模拟未通过记录：用于检查失败尝试和谱系展示', metrics: {} as typeof attempts[number]['metrics'],
        recipe: {expression: {op: 'input', name: 'local_demo_signal'}, parameters: {}}, complexity: 1});
    if (!completeVariants && first.variants[0] && attempts.length < input.config.maxCandidates - (input.config.evolution ? 1 : 0)) attempts.push({...structuredClone(attempts[0]), id: `attempt-${attempts.length + 1}`,
        parents: ['attempt-1'], operation: 'parameter_variant', requested_parameters: Object.fromEntries(first.variants[0].map(row => [row.name, row.value]))});
    if (completeVariants) for (const values of first.variants) {
        if (attempts.length >= input.config.maxCandidates) break;
        attempts.push({...structuredClone(attempts[0]), id: `attempt-${attempts.length + 1}`, parents: ['attempt-1'], operation: 'parameter_variant', requested_parameters: Object.fromEntries(values.map(row => [row.name, row.value]))});
    }
    if (!input.config.evolution && input.seeds.length > 1 && input.config.generations > 1 && attempts.length < input.config.maxCandidates) attempts.push({...structuredClone(attempts[0]), id: `attempt-${attempts.length + 1}`, parents: ['attempt-1', 'attempt-2'], operation: 'mean', generation: 1,
        requested_parameters: Object.fromEntries(input.seeds.slice(0, 2).flatMap((seed, index) => seed.parameters.map(row => [`${index === 0 ? 'a' : 'b'}_${row.name}`, row.value])))});
    if (input.config.evolution && input.config.generations > 1 && attempts.length < input.config.maxCandidates) {
        const mutation = mockFormulaEvolution(input, seeds);
        if (mutation) attempts.push({...structuredClone(attempts[0]), ...mutation, id: `attempt-${attempts.length + 1}`, operation: 'formula_mutation', generation: 1,
            requested_parameters: null, status: mutation.reason ? 'rejected' : 'evaluated', metrics: mutation.reason ? {} : structuredClone(attempts[0].metrics)});
    }
    const output = {engine_version: engineVersion, selected_id: 'attempt-1', attempts, holdout: metric([1, 1.02, .99, 1.03, 1.015, 1.04], true), buy_hold_baseline: metric([1, 1.01, 1.005, 1.015, 1.02, 1.025], true, true),
        stop_reason: 'generation_complete', limitations: ['以上指标、曲线与尝试均为人工构造的本地展示样例，未使用导入行情进行回测。', '真实实验需由后端受控表达式引擎计算；本地样例不能用于评价策略或推荐参数。']};
    return {attempts, envelope: {version: 1, status: 'completed', error: '', output, checkpoint_hashes: [], overlap_audit: {scope: 'same_collection_symbol_timeframe_requested_ranges', request_ids: [], total: 0, independent_holdout_proven: false}, local_demo: true}};
}
