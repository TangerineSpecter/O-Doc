import {isParameterText} from './quantParameterValues';
import type {QuantAnalysis} from '../types/api/quant';
import type {QuantParameterDomain} from '../types/api/quantParameters';

import {conditionReferences, describeParameterCondition, evaluateParameterCondition, validateParameterCondition, parameterSymbols as symbols} from './quantParameterConditions';
export function describeParameterDomain(name: string, domain: QuantParameterDomain): string {
    const parts: string[] = [];
    if (domain.minimum !== null) parts.push(`${name} ≥ ${domain.minimum}`);
    if (domain.maximum !== null) parts.push(`${name} ≤ ${domain.maximum}`);
    if (domain.step !== null) parts.push(`步长 ${domain.step}，起点 ${domain.stepOrigin}`);
    if (domain.choices.length) parts.push(`枚举：${domain.choices.join('、')}`);
    parts.push(...domain.relations.map(row => `${name} ${symbols[row.operator]} ${row.parameter}`));
    parts.push(...(domain.conditions || []).map(rule => `当 ${describeParameterCondition(rule.when)} 时，要求 ${describeParameterCondition(rule.require)}`));
    return parts.join('；');
}

function decimal(value: number): [bigint, number] {
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    return [BigInt(mantissa.replace('.', '')), (mantissa.split('.')[1]?.length || 0) - Number(exponent)];
}
function onStep(value: number, origin: number, step: number): boolean {
    const decimals = [value, origin, step].map(decimal);
    const scale = Math.max(...decimals.map(([, power]) => power));
    const [v, o, s] = decimals.map(([coefficient, power]) => coefficient * 10n ** BigInt(scale - power));
    return s > 0n && (v - o) % s === 0n;
}

/** Early feedback only. The backend revalidates the frozen contract before execution. */
export function checkParameterDomains(parameters: QuantAnalysis['parameters'], values: Record<string, number | boolean | string>): void {
    const checkType = (row: QuantAnalysis['parameters'][number], value: number | boolean | string) => {
        const kind = row.type.trim().toLowerCase();
        if (['int', 'integer'].includes(kind) && (typeof value !== 'number' || !Number.isInteger(value)) ||
            ['float', 'double', 'number'].includes(kind) && (typeof value !== 'number' || !Number.isFinite(value)) ||
            ['bool', 'boolean'].includes(kind) && typeof value !== 'boolean' ||
            ['string', 'str'].includes(kind) && (!isParameterText(value))) throw new Error(`参数 ${row.name} 与声明类型不一致`);
    };
    for (const row of parameters) {
        const domain = row.domain;
        if (typeof values[row.name] === 'string' && (!['string', 'str'].includes(row.type.trim().toLowerCase()) || !domain || domain.version < 3 || !domain.choices.length)) throw new Error('字符串实验参数必须有 v3/v4 声明枚举');
        if (!domain) continue;
        const value = values[row.name];
        checkType(row, value);
        if (domain.minimum !== null && (typeof value !== 'number' || value < domain.minimum)) throw new Error(`参数 ${row.name} 小于声明下限 ${domain.minimum}`);
        if (domain.maximum !== null && (typeof value !== 'number' || value > domain.maximum)) throw new Error(`参数 ${row.name} 大于声明上限 ${domain.maximum}`);
        if (domain.choices.length && !domain.choices.includes(value)) throw new Error(`参数 ${row.name} 不在声明枚举中`);
        if (domain.step !== null && (typeof value !== 'number' || domain.stepOrigin === null || !onStep(value, domain.stepOrigin, domain.step))) throw new Error(`参数 ${row.name} 不满足声明步长 ${domain.step}（起点 ${domain.stepOrigin}）`);
        for (const rule of domain.conditions || []) {
            validateParameterCondition(rule.when, domain.version, values);
            validateParameterCondition(rule.require, domain.version, values);
            for (const name of new Set([...conditionReferences(rule.when), ...conditionReferences(rule.require)])) {
                const dependency = parameters.find(item => item.name === name);
                if (!dependency || !(name in values)) throw new Error('条件约束缺少依赖参数值');
                if (domain.version === 4 && !['int', 'integer', 'float', 'double', 'number', 'bool', 'boolean', 'string', 'str'].includes(dependency.type.trim().toLowerCase())) throw new Error('v4 条件约束必须引用已识别声明类型的参数');
                checkType(dependency, values[name]);
            }
            if (evaluateParameterCondition(rule.when, values, domain.version) && !evaluateParameterCondition(rule.require, values, domain.version))
                throw new Error(`条件约束不满足：当 ${describeParameterCondition(rule.when)} 时，要求 ${describeParameterCondition(rule.require)}`);
        }
        for (const relation of domain.relations) {
            const otherRow = parameters.find(item => item.name === relation.parameter);
            if (!otherRow) throw new Error('参数关系缺少依赖参数');
            const other = values[relation.parameter];
            checkType(otherRow, other);
            const valid = {lt: value < other, lte: value <= other, gt: value > other, gte: value >= other, eq: value === other, ne: value !== other};
            if (!valid[relation.operator]) throw new Error(`参数关系不满足：${row.name} ${symbols[relation.operator]} ${relation.parameter}`);
        }
    }
}
