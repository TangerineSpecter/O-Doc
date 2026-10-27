import type {QuantAnalysis} from '../types/api/quant';
type Parameter = QuantAnalysis['parameters'][number];

export function parameterLabel(value: Parameter): string {
    const origin = value.sourceBinding;
    if (!origin) return value.name;
    return origin.status === 'resolved' ? `${origin.file} · ${origin.scope} · ${origin.sourceName}` : `${origin.sourceName} · ${origin.status === 'hypothesis' ? '实验假设' : '未定位'}`;
}

export function parameterValueLabel(name: string, parameters: Parameter[] = []): string {
    const value = parameters.find(row => row.name === name);
    return value ? parameterLabel(value) : name;
}
