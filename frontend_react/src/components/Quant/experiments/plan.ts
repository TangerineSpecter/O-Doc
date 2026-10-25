import {isParameterText} from '../../../utils/quantParameterValues';
import type {QuantFactorCandidate} from '../../../types/api/quant';
import type {QuantExperimentSeed} from '../../../types/api/quantExperiment';
import {checkParameterDomains} from '../../../utils/quantParameterDomain';
export interface SeedDraft {bindings: Record<string, string>; parameters: Record<string, string>}
const columns = ['open', 'high', 'low', 'close', 'volume'] as const;
export const numericValue = (text: string): number | boolean | undefined => {
    if (!text.trim()) return undefined;
    try {const value: unknown = JSON.parse(text); return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined;} catch {return undefined;}
};
export function parameterValue(text: string, type: string): number | boolean | string | undefined {
    if (!['string', 'str'].includes(type.trim().toLowerCase())) return numericValue(text);
    try {const value: unknown = JSON.parse(text); return isParameterText(value) ? value : undefined;} catch {return undefined;}
}
export function initialSeed(candidate: QuantFactorCandidate): SeedDraft {
    return {bindings: Object.fromEntries(candidate.data.inputs.map(row => [row.name, columns.find(column => column === row.name.toLowerCase()) || ''])),
        parameters: Object.fromEntries(candidate.data.parameters.map(row => [row.name, parameterValue(row.defaultValue, row.type) === undefined ? '' : row.defaultValue]))};
}
function windowParameters(node: unknown): string[] {
    if (!node || typeof node !== 'object') return [];
    const value = node as {op?: string; name?: string; args?: unknown[]};
    if (!Array.isArray(value.args)) return [];
    const window = value.args[1] as {op?: string; name?: string} | undefined;
    return [...new Set([...(['lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'].includes(value.op || '') && window?.op === 'parameter' && window.name ? [window.name] : []), ...value.args.flatMap(windowParameters)])];
}
export function buildSeed(candidate: QuantFactorCandidate, draft: SeedDraft, neighbors: boolean): QuantExperimentSeed {
    if (!candidate.data.expression || !['numeric_series', 'boolean_series'].includes(candidate.data.outputType)) throw new Error(`${candidate.curation.name} 尚无可计算表达式`);
    const bindings = candidate.data.inputs.map(row => {
        const column = columns.find(value => value === draft.bindings[row.name]);
        if (!column) throw new Error(`请指定 ${candidate.curation.name} 的 ${row.name} 输入列`);
        return {name: row.name, column};
    });
    const parameters = candidate.data.parameters.map(row => {
        const value = parameterValue(draft.parameters[row.name] || '', row.type);
        if (value === undefined) throw new Error(`请补充 ${candidate.curation.name} 的 ${row.name} 符合声明类型的参数`);
        return {name: row.name, value};
    });
    const windows = windowParameters(candidate.data.expression);
    checkParameterDomains(candidate.data.parameters, Object.fromEntries(parameters.map(row => [row.name, row.value])));
    const variants: QuantExperimentSeed['variants'] = [];
    if (neighbors) for (const parameter of parameters) {
        if (!windows.includes(parameter.name) || candidate.data.parameters.find(row => row.name === parameter.name)?.category !== 'signal' || typeof parameter.value !== 'number' || !Number.isInteger(parameter.value) || parameter.value < 1 || parameter.value > 2000) continue;
        for (const value of new Set([Math.max(1, Math.round(parameter.value * .75)), Math.min(2000, Math.round(parameter.value * 1.25))])) {
            if (value !== parameter.value && variants.length < 16) variants.push(parameters.map(row => row.name === parameter.name ? {...row, value} : {...row}));
        }
    }
    return {candidateId: candidate.id, bindings, parameters, variants};
}
