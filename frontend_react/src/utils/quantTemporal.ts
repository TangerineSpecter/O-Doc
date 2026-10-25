import type {QuantExperimentConfig, QuantExperimentSeed, QuantWalkForwardPolicy} from '../types/api/quantExperiment';

export const defaultWalkForward: QuantWalkForwardPolicy = {version: 1, mode: 'expanding', folds: 3, trainBars: 40, validationBars: 10, testBars: 10, warmupBars: 0};
export const temporalSnapshot = (p: QuantWalkForwardPolicy) => ({version: p.version, mode: p.mode, folds: p.folds, train_bars: p.trainBars, validation_bars: p.validationBars, test_bars: p.testBars, warmup_bars: p.warmupBars});
export function readTemporal(raw: unknown): QuantWalkForwardPolicy {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('滚动验证配置无效');
    const p = raw as Record<string, unknown>;
    const keys = Object.keys(temporalSnapshot(defaultWalkForward));
    if (Object.keys(p).length !== keys.length || keys.some(key => !(key in p)) || p.version !== 1 || !['expanding', 'rolling'].includes(String(p.mode))) throw new Error('滚动验证配置版本或字段无效');
    for (const [key, min, max] of [['folds', 2, 5], ['train_bars', 20, 20000], ['validation_bars', 5, 20000], ['test_bars', 5, 20000], ['warmup_bars', 0, 2000]] as const) {
        if (typeof p[key] !== 'number' || !Number.isInteger(p[key]) || p[key] < min || p[key] > max) throw new Error('滚动验证需 2–5 折，训练至少 20 段、验证和测试至少 5 段，预热 0–2000 根');
    }
    return {version: 1, mode: p.mode as QuantWalkForwardPolicy['mode'], folds: p.folds as number, trainBars: p.train_bars as number, validationBars: p.validation_bars as number, testBars: p.test_bars as number, warmupBars: p.warmup_bars as number};
}
export type TemporalDraft = {enabled: boolean; mode: QuantWalkForwardPolicy['mode']; folds: string; trainBars: string; validationBars: string; testBars: string; warmupBars: string};
export function temporalDraft(policy?: QuantWalkForwardPolicy): TemporalDraft {
    const p = policy || defaultWalkForward;
    return {enabled: !!policy, mode: p.mode, folds: String(p.folds), trainBars: String(p.trainBars), validationBars: String(p.validationBars), testBars: String(p.testBars), warmupBars: String(p.warmupBars)};
}
export function buildTemporal(draft: TemporalDraft): QuantWalkForwardPolicy | undefined {
    if (!draft.enabled) return undefined;
    const values = [draft.folds, draft.trainBars, draft.validationBars, draft.testBars, draft.warmupBars];
    if (values.some(value => !value.trim())) throw new Error('请填写完整的滚动验证窗口');
    return readTemporal({version: 1, mode: draft.mode, folds: Number(draft.folds), train_bars: Number(draft.trainBars), validation_bars: Number(draft.validationBars), test_bars: Number(draft.testBars), warmup_bars: Number(draft.warmupBars)});
}
export function temporalWindows(size: number, policy: QuantWalkForwardPolicy, gap: number) {
    readTemporal(temporalSnapshot(policy));
    if (!Number.isInteger(gap) || gap < 1 || gap > 2000) throw new Error('隔离间隔为 1–2000 根');
    const needed = 2 + policy.warmupBars + policy.trainBars + policy.validationBars + policy.folds * policy.testBars + 2 * (gap + 1);
    if (!Number.isInteger(size) || size < Math.max(60, needed) || size > 20000) throw new Error(`当前滚动验证至少需要 ${Math.max(60, needed)} 根行情，实际 ${size} 根`);
    const start = size - needed + policy.warmupBars + 1;
    return Array.from({length: policy.folds}, (_, index) => {
        const shift = index * policy.testBars, trainStart = start + (policy.mode === 'rolling' ? shift : 0), trainEnd = start + policy.trainBars + shift;
        const validationStart = trainEnd + gap + 1, validationEnd = validationStart + policy.validationBars, testStart = validationEnd + gap + 1;
        return {number: index + 1, calculation_start: trainStart - 1 - policy.warmupBars, partitions: {train: [trainStart, trainEnd], validation: [validationStart, validationEnd], holdout: [testStart, testStart + policy.testBars]}};
    });
}
export function validateTemporalBudget(policy: QuantWalkForwardPolicy, seeds: QuantExperimentSeed[], config: Pick<QuantExperimentConfig, 'maxCandidates' | 'evolution'>) {
    const minimum = seeds.reduce((sum, seed) => sum + 1 + seed.variants.length, 0) + Number(!!config.evolution);
    if (!Number.isInteger(config.maxCandidates) || config.maxCandidates < 1 || config.maxCandidates > 32 || Math.floor(config.maxCandidates / policy.folds) < minimum) throw new Error(`每折至少 ${minimum} 次尝试，${policy.folds} 折总预算至少 ${minimum * policy.folds} 次（整批最多 32 次）`);
}
