import type {QuantEvolutionOperator, QuantEvolutionPolicy, QuantFormulaTransform} from '../types/api/quantExperiment';
export const evolutionNames: Record<QuantEvolutionOperator, string> = {lag: '滞后', smooth: '平滑', zscore: '滚动标准化', mean: '均值组合', weighted_mean: '加权组合', residual: '滚动残差', and: '条件交集', or: '条件并集', ts_rank: '时序相对排序', gate: '条件门控', crossover: '公式片段交叉'};
export const defaultEvolution: QuantEvolutionPolicy = {version: 2, operators: ['lag', 'smooth', 'zscore', 'mean', 'weighted_mean', 'residual', 'and', 'or', 'ts_rank', 'gate'], windows: [3, 10], weights: [.25, .75], maxNodes: 96};
const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('公式演化配置无效');
    return value as Record<string, unknown>;
};
const operators = (value: unknown, version: 1 | 2 | 3 = 2): QuantEvolutionOperator[] => {
    if (!Array.isArray(value) || !value.length || value.length > (version === 1 ? 8 : version === 2 ? 10 : 11) || new Set(value).size !== value.length || value.some(op => typeof op !== 'string' || !Object.prototype.hasOwnProperty.call(evolutionNames, op) || version === 1 && ['ts_rank', 'gate'].includes(op) || version < 3 && op === 'crossover')) throw new Error('请选择不重复的演化算子');
    return value as QuantEvolutionOperator[];
};
function numbers(value: unknown, valid: (n: number) => boolean, name: string): number[] {
    if (!Array.isArray(value) || !value.length || value.length > 4 || new Set(value).size !== value.length || value.some(n => typeof n !== 'number' || !Number.isFinite(n) || !valid(n))) throw new Error(name);
    return value;
}
/** JSON snapshots use literal snake_case; API inputs use camelCase. */
export function readEvolution(value: unknown): QuantEvolutionPolicy {
    const row = object(value);
    if (![1, 2, 3].includes(Number(row.version)) || typeof row.version !== 'number' || Object.keys(row).sort().join(',') !== 'max_nodes,operators,version,weights,windows') throw new Error('公式演化配置版本或字段无效');
    const maxNodes = row.max_nodes;
    if (typeof maxNodes !== 'number' || !Number.isInteger(maxNodes) || maxNodes < 8 || maxNodes > 128) throw new Error('公式节点上限须为 8–128');
    return {version: row.version as 1 | 2 | 3, operators: operators(row.operators, row.version as 1 | 2 | 3), windows: numbers(row.windows, n => Number.isInteger(n) && n >= 1 && n <= 2000, '窗口须为 1–4 个不同的 1–2000 整数'),
        weights: numbers(row.weights, n => n > 0 && n < 1, '权重须为 1–4 个不同的 0–1 之间数值'), maxNodes};
}
export const evolutionSnapshot = ({maxNodes, ...policy}: QuantEvolutionPolicy) => ({...policy, max_nodes: maxNodes});
export function readTransformation(value: unknown, policy: QuantEvolutionPolicy): QuantFormulaTransform {
    const row = object(value), operator = operators([row.operator], policy.version)[0];
    const keys = operator === 'crossover' ? 'donor_path,operator,recipient_path,version,weight,window' : 'operator,version,weight,window';
    if (row.version !== policy.version || Object.keys(row).sort().join(',') !== keys || !policy.operators.includes(operator)) throw new Error('公式变换不属于本轮配置');
    const windowed = ['lag', 'smooth', 'zscore', 'residual', 'ts_rank'].includes(operator);
    if (windowed ? typeof row.window !== 'number' || !policy.windows.includes(row.window) : row.window !== null) throw new Error('公式变换窗口不属于本轮配置');
    if (operator === 'weighted_mean' ? typeof row.weight !== 'number' || !policy.weights.includes(row.weight) : row.weight !== null) throw new Error('公式变换权重不属于本轮配置');
    const path = (value: unknown, recipient = false): number[] => {
        if (!Array.isArray(value) || value.length > 12 || recipient && !value.length || value.some(index => typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > 1)) throw new Error('公式交叉路径无效');
        return value;
    };
    return {version: policy.version, operator, window: row.window as number | null, weight: row.weight as number | null,
        ...(operator === 'crossover' ? {recipientPath: path(row.recipient_path, true), donorPath: path(row.donor_path)} : {})};
}
export const transformationSnapshot = ({recipientPath, donorPath, ...value}: QuantFormulaTransform) => ({...value,
    ...(value.operator === 'crossover' ? {recipient_path: recipientPath, donor_path: donorPath} : {})});
const pathLabel = (path: number[] = []) => path.length ? path.map(index => `第 ${index + 1} 项`).join(' → ') : '整式';
export const transformationLabel = (value: QuantFormulaTransform) => `${evolutionNames[value.operator]}${value.window === null ? '' : ` · 窗口 ${value.window}`}${value.weight === null ? '' : ` · 左父代权重 ${value.weight}`}${value.operator === 'crossover' ? ` · 父代一 ${pathLabel(value.recipientPath)} ← 父代二 ${pathLabel(value.donorPath)}` : ''}`;
export interface EvolutionDraft {version: 1 | 2 | 3; enabled: boolean; operators: QuantEvolutionOperator[]; windows: string; weights: string; maxNodes: string}
export function evolutionDraft(policy = defaultEvolution, enabled = true): EvolutionDraft {
    return {version: policy.version, enabled, operators: [...policy.operators], windows: policy.windows.join(', '), weights: policy.weights.join(', '), maxNodes: String(policy.maxNodes)};
}
export function buildEvolution(draft: EvolutionDraft): QuantEvolutionPolicy | undefined {
    if (!draft.enabled) return undefined;
    const list = (text: string) => text.split(/[,，\s]+/).filter(Boolean).map(Number);
    return readEvolution({version: draft.operators.includes('crossover') ? 3 : draft.operators.some(op => ['ts_rank', 'gate'].includes(op)) ? Math.max(2, draft.version) : draft.version, operators: draft.operators, windows: list(draft.windows), weights: list(draft.weights), max_nodes: draft.maxNodes.trim() ? Number(draft.maxNodes) : null});
}
