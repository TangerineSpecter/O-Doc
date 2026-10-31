import {readAlgorithmProgram} from '../../utils/quantAlgorithm';
/** Checks the engine vocabulary and scalar types only; does not calculate an output. */
import type {QuantFactorData} from '../../types/api/quant';
import {isParameterText} from '../../utils/quantParameterValues';
type Kind = 'number' | 'boolean' | 'string';
const unary = ['abs', 'neg', 'log'];
const rolling = ['lag', 'sma', 'sum', 'std', 'highest', 'lowest', 'ts_rank'];
const binary = ['add', 'sub', 'mul', 'div', 'min', 'max', 'gt', 'lt', 'eq', 'and', 'or', 'gate'];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (node: Record<string, unknown>, keys: string[]) => Object.keys(node).sort().join(',') === [...keys].sort().join(',');
export function validateMockComparisonExpression(data: QuantFactorData, parameters: Record<string, number | boolean | string>) {
    let nodes = 0;
    const visit = (value: unknown, depth = 0): Kind => {
        if (++nodes > 128 || depth > 12 || !object(value)) throw new Error('受控表达式过深、过大或不是对象');
        const op = value.op;
        if (op === 'program') {const program = readAlgorithmProgram(value); if (!program) throw new Error('算法样例格式无效'); return program.outputType === 'boolean_series' ? 'boolean' : 'number';}
        if (op === 'input' && exact(value, ['op', 'name']) && data.inputs.some(row => row.name === value.name)) return 'number';
        if (op === 'parameter' && exact(value, ['op', 'name']) && typeof value.name === 'string' && Object.prototype.hasOwnProperty.call(parameters, value.name)) return typeof parameters[value.name] as Kind;
        if (op === 'constant' && exact(value, ['op', 'value']) && (typeof value.value === 'number' && Number.isFinite(value.value) || isParameterText(value.value))) return typeof value.value as Kind;
        if (typeof op !== 'string' || !exact(value, ['op', 'args']) || !Array.isArray(value.args) || ![...unary, ...rolling, ...binary].includes(op) || value.args.length !== (unary.includes(op) ? 1 : 2)) throw new Error('表达式含未知算子、字段或未声明的输入/参数');
        const left = visit(value.args[0], depth + 1);
        if (rolling.includes(op)) {
            const windowNode = value.args[1]; visit(windowNode, depth + 1);
            if (!object(windowNode) || !['constant', 'parameter'].includes(String(windowNode.op))) throw new Error('窗口须为常量或明确的参数');
            const window = windowNode.op === 'constant' ? windowNode.value : parameters[String(windowNode.name)];
            if (typeof window !== 'number' || !Number.isInteger(window) || window < 1 || window > 2000 || left === 'string' || op !== 'lag' && left !== 'number') throw new Error('窗口须为1–2000整数且统计窗口需要数值输入');
            return op === 'lag' ? left : 'number';
        }
        if (unary.includes(op)) {if (left !== 'number') throw new Error('数值算子需要数值输入'); return 'number';}
        const right = visit(value.args[1], depth + 1);
        if (op === 'eq') {if (left !== right) throw new Error('相等比较需要同类型输入'); return 'boolean';}
        if (left === 'string' || right === 'string') throw new Error('字符串仅允许同类型相等比较');
        if (op === 'gate') {if (right !== 'boolean') throw new Error('门控需要布尔条件'); return left;}
        if (['and', 'or'].includes(op)) {if (left !== 'boolean' || right !== 'boolean') throw new Error('逻辑组合需要布尔条件'); return 'boolean';}
        if (left !== 'number' || right !== 'number') throw new Error('算术和大小比较需要数值输入');
        return ['gt', 'lt'].includes(op) ? 'boolean' : 'number';
    };
    if (visit(data.expression) !== (data.outputType === 'numeric_series' ? 'number' : 'boolean')) throw new Error('受控表达式输出类型与声明不符');
}
