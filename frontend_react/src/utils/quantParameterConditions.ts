import type {QuantParameterPredicate, QuantParameterOperand, QuantParameterComparisonOperator, QuantParameterArithmeticOperator} from '../types/api/quantParameters';
import {assertParameterArithmeticInput, calculateParameterRational, compareParameterRational, negateParameterRational, parameterRational, type ParameterRational} from './quantParameterRational';
import {isParameterText} from './quantParameterValues';

export const parameterSymbols: Record<QuantParameterComparisonOperator, string> = {lt: '<', lte: '≤', gt: '>', gte: '≥', eq: '=', ne: '≠'};
const arithmeticSymbols: Record<QuantParameterArithmeticOperator, string> = {add: '+', sub: '−', mul: '×', div: '÷'};
type Values = Record<string, number | boolean | string>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const keys = (value: Record<string, unknown>, expected: string[]) => Object.keys(value).length === expected.length && expected.every(key => key in value);
const comparison = (operator: QuantParameterComparisonOperator, sign: number) => ({lt: sign < 0, lte: sign <= 0, gt: sign > 0, gte: sign >= 0, eq: sign === 0, ne: sign !== 0})[operator];

function describeOperand(operand: QuantParameterOperand): string {
    if ('parameter' in operand) return operand.parameter;
    if ('value' in operand) return String(operand.value);
    if (operand.operator === 'neg') return `−(${describeOperand(operand.argument)})`;
    return `(${describeOperand(operand.left)} ${arithmeticSymbols[operand.operator]} ${describeOperand(operand.right)})`;
}
export function describeParameterCondition(predicate: QuantParameterPredicate): string {
    if ('arguments' in predicate) return `(${predicate.arguments.map(describeParameterCondition).join(predicate.operator === 'all' ? ' 且 ' : ' 或 ')})`;
    if ('argument' in predicate) return `非(${describeParameterCondition(predicate.argument)})`;
    return `${describeOperand(predicate.left)} ${parameterSymbols[predicate.operator]} ${describeOperand(predicate.right)}`;
}
function operandReferences(operand: QuantParameterOperand): string[] {
    if ('parameter' in operand) return [operand.parameter];
    if ('value' in operand) return [];
    if (operand.operator === 'neg') return operandReferences(operand.argument);
    return [...operandReferences(operand.left), ...operandReferences(operand.right)];
}
export function conditionReferences(predicate: QuantParameterPredicate): string[] {
    if ('arguments' in predicate) return predicate.arguments.flatMap(conditionReferences);
    if ('argument' in predicate) return conditionReferences(predicate.argument);
    return [...operandReferences(predicate.left), ...operandReferences(predicate.right)];
}

/** Validate every branch before short-circuit evaluation; legacy budgets count predicates only. */
export function validateParameterCondition(predicate: QuantParameterPredicate, version: number, values?: Values): void {
    let count = 0;
    const tick = (depth: number) => {
        if (++count > (version === 4 ? 64 : 32) || depth > (version === 4 ? 8 : 6)) throw new Error(version === 4 ? '条件表达式超过 64 节点/8 层预算' : '条件表达式超过 32 节点/6 层预算');
    };
    const scalarType = (value: unknown): string => {
        if (typeof value === 'number' && Number.isFinite(value)) {if (version === 4) assertParameterArithmeticInput(value); return 'number';}
        if (typeof value === 'boolean') return 'boolean';
        if (version >= 3 && isParameterText(value)) return 'string';
        throw new Error('条件常量或依赖参数类型无效');
    };
    const operand = (node: unknown, depth: number): string | undefined => {
        if (version === 4) tick(depth);
        if (!object(node)) throw new Error('条件操作数格式无效');
        if (keys(node, ['parameter']) && typeof node.parameter === 'string' && node.parameter.length >= 1 && node.parameter.length <= 200) {
            if (!values) return undefined;
            if (!(node.parameter in values)) throw new Error('条件约束缺少依赖参数值');
            return scalarType(values[node.parameter]);
        }
        if (keys(node, ['value'])) return scalarType(node.value);
        if (version !== 4) throw new Error('条件算术需要 domain v4');
        let children: (string | undefined)[];
        if (node.operator === 'neg' && keys(node, ['operator', 'argument'])) children = [operand(node.argument, depth + 1)];
        else if (typeof node.operator === 'string' && own(arithmeticSymbols, node.operator) && keys(node, ['operator', 'left', 'right'])) children = [operand(node.left, depth + 1), operand(node.right, depth + 1)];
        else throw new Error('未知条件算术运算符或多余字段');
        if (children.some(kind => kind !== undefined && kind !== 'number')) throw new Error('布尔和字符串不可参与条件算术');
        return 'number';
    };
    const visit = (node: unknown, depth: number): void => {
        tick(depth);
        if (!object(node)) throw new Error('条件表达式格式无效');
        if ((node.operator === 'all' || node.operator === 'any') && keys(node, ['operator', 'arguments']) && Array.isArray(node.arguments) && node.arguments.length >= 2 && node.arguments.length <= 8) {
            node.arguments.forEach(child => visit(child, depth + 1)); return;
        }
        if (node.operator === 'not' && keys(node, ['operator', 'argument'])) {visit(node.argument, depth + 1); return;}
        if (typeof node.operator !== 'string' || !own(parameterSymbols, node.operator) || !keys(node, ['operator', 'left', 'right'])) throw new Error('未知条件运算符或多余字段');
        const left = operand(node.left, depth + 1), right = operand(node.right, depth + 1);
        if (!operandReferences(node.left as QuantParameterOperand).length && !operandReferences(node.right as QuantParameterOperand).length) throw new Error('条件比较必须引用至少一个参数');
        if (left && right && (['boolean', 'string'].includes(left) || ['boolean', 'string'].includes(right)) && (left !== right || !['eq', 'ne'].includes(node.operator))) throw new Error('布尔或字符串条件仅支持同类型相等/不等比较');
    };
    visit(predicate, 1);
}

function exactOperand(operand: QuantParameterOperand, values: Values): ParameterRational | boolean | string {
    if ('parameter' in operand || 'value' in operand) {
        const value = 'parameter' in operand ? values[operand.parameter] : operand.value;
        return typeof value === 'number' ? parameterRational(value) : value;
    }
    const numeric = (value: ParameterRational | boolean | string): ParameterRational => {
        if (typeof value !== 'object') throw new Error('布尔和字符串不可参与条件算术');
        return value;
    };
    if (operand.operator === 'neg') return negateParameterRational(numeric(exactOperand(operand.argument, values)));
    return calculateParameterRational(operand.operator, numeric(exactOperand(operand.left, values)), numeric(exactOperand(operand.right, values)));
}
export function evaluateParameterCondition(predicate: QuantParameterPredicate, values: Values, version = 3): boolean {
    validateParameterCondition(predicate, version, values);
    const evaluate = (node: QuantParameterPredicate): boolean => {
        if ('arguments' in node) return node.operator === 'all' ? node.arguments.every(evaluate) : node.arguments.some(evaluate);
        if ('argument' in node) return !evaluate(node.argument);
        if (version === 4) {
            const left = exactOperand(node.left, values), right = exactOperand(node.right, values);
            if (typeof left === 'object' && typeof right === 'object') return comparison(node.operator, compareParameterRational(left, right));
            return node.operator === 'eq' ? left === right : node.operator === 'ne' && left !== right;
        }
        const value = (operand: QuantParameterOperand) => 'parameter' in operand ? values[operand.parameter] : 'value' in operand ? operand.value : undefined;
        const left = value(node.left)!, right = value(node.right)!;
        return {lt: left < right, lte: left <= right, gt: left > right, gte: left >= right, eq: left === right, ne: left !== right}[node.operator];
    };
    return evaluate(predicate);
}
function renameOperand(operand: QuantParameterOperand, mapping: Record<string, string>): QuantParameterOperand {
    if ('parameter' in operand) {
        if (!mapping[operand.parameter]) throw new Error('条件参数重命名缺少依赖');
        return {parameter: mapping[operand.parameter]};
    }
    if ('value' in operand) return {...operand};
    if (operand.operator === 'neg') return {...operand, argument: renameOperand(operand.argument, mapping)};
    return {...operand, left: renameOperand(operand.left, mapping), right: renameOperand(operand.right, mapping)};
}
export function renameParameterCondition(predicate: QuantParameterPredicate, mapping: Record<string, string>): QuantParameterPredicate {
    if ('arguments' in predicate) return {...predicate, arguments: predicate.arguments.map(child => renameParameterCondition(child, mapping))};
    if ('argument' in predicate) return {...predicate, argument: renameParameterCondition(predicate.argument, mapping)};
    return {...predicate, left: renameOperand(predicate.left, mapping), right: renameOperand(predicate.right, mapping)};
}
