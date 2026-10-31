import type {QuantFactorData} from '../types/api/quant';
import type {AlgorithmProfile, AlgorithmProgram, AlgorithmSimilarity, AlgorithmStep} from '../types/api/quantAlgorithm';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function containsAlgorithmProgram(value: unknown): boolean {
    return object(value) && (value.op === 'program' || Array.isArray(value.args) && value.args.some(containsAlgorithmProgram));
}
export function readPythonAlgorithm(value: unknown): string | null {
    return object(value) && value.op === 'python' && value.version === 1 && typeof value.code === 'string' ? value.code : null;
}
/** Shape validation for reading; the owning backend validates Python expressions without executing source. */
export function readAlgorithmProgram(value: unknown): AlgorithmProgram | null {
    if (!object(value) || value.op !== 'program') return null;
    let count = 0;
    const steps = (rows: unknown, depth = 0): rows is AlgorithmStep[] => Array.isArray(rows) && depth <= 12 && rows.every(row => {
        if (++count > 256 || !object(row)) return false;
        return row.kind === 'if' ? typeof row.test === 'string' && steps(row.then, depth + 1) && steps(row.else, depth + 1)
            : ['assign', 'initialize'].includes(String(row.kind)) && typeof row.name === 'string' && /^[A-Za-z_]\w{0,79}$/.test(row.name) && typeof row.value === 'string';
    });
    const outputType = value.outputType ?? value.output_type;
    if (value.version !== 1 || typeof value.output !== 'string' || !['numeric_series', 'boolean_series'].includes(String(outputType)) || !steps(value.steps)) throw new Error('统一算法计算定义格式无效');
    return {op: 'program', version: 1, output: value.output as string, outputType: outputType as AlgorithmProgram['outputType'], steps: value.steps as AlgorithmStep[]};
}

export function algorithmCode(program: AlgorithmProgram): string {
    const lines: string[] = [];
    const walk = (rows: AlgorithmStep[], level = 0) => rows.forEach(row => {
        const prefix = '    '.repeat(level);
        if (row.kind === 'if') {
            lines.push(`${prefix}if ${row.test}:`); walk(row.then, level + 1);
            if (!row.then.length) lines.push(`${prefix}    pass`);
            if (row.else.length) {lines.push(`${prefix}else:`); walk(row.else, level + 1);}
        } else {
            if (row.kind === 'initialize') lines.push(`${prefix}# 首根初始化；随后跨 K 线保留`);
            lines.push(`${prefix}${row.name} = ${row.value}`);
        }
    });
    walk(program.steps); lines.push(`return ${program.output}`);
    return lines.join('\n');
}

export function algorithmProfile(data: QuantFactorData): AlgorithmProfile | null {
    if (!data.expression) return null;
    const program = readAlgorithmProgram(data.expression);
    const operations = new Set<string>(), states: string[] = [];
    const python = readPythonAlgorithm(data.expression);
    if (python) {
        for (const match of python.matchAll(/\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\(/g)) operations.add(match[1]);
    } else if (program) {
        const walk = (rows: AlgorithmStep[]) => rows.forEach(row => {
            if (row.kind === 'if') {walk(row.then); walk(row.else);}
            else {
                if (row.kind === 'initialize') states.push(row.name);
                for (const match of row.value.matchAll(/\b([A-Za-z_]\w*)\(/g)) operations.add(match[1]);
                if (row.value.includes(' + ')) operations.add('add');
                if (row.value.includes(' - ')) operations.add('sub');
                if (row.value.includes(' * ')) operations.add('mult');
                if (row.value.includes(' / ')) operations.add('div');
            }
        }); walk(program.steps);
    } else {
        const walk = (node: Record<string, unknown>) => {operations.add(String(node.op)); if (Array.isArray(node.args)) node.args.forEach(child => {if (object(child)) walk(child);});};
        walk(data.expression);
    }
    const count = data.parameters.filter(row => !!row.defaultValue.trim()).length;
    return {method: 'source-algorithm-properties-v1', family: data.family, role: data.role, inputs: data.inputs.map(row => row.name), parameters: data.parameters.map(row => row.name),
        operations: [...operations].sort(), states, output: program?.output || data.name, timeframe: data.timeframe,
        marketScope: data.inputs.every(row => ['open', 'high', 'low', 'close', 'volume'].includes(row.name.toLowerCase())) ? '价格序列通用计算' : '按声明数据输入计算',
        definitionScore: data.parameters.length ? Math.round(75 + 25 * count / data.parameters.length) : 100,
        scoreMeaning: '算法定义完整度：输入与计算闭合75分，参数默认值完整度25分；不是收益评分。'};
}

export function algorithmSimilarity(left: QuantFactorData, right: QuantFactorData): AlgorithmSimilarity | null {
    const a = algorithmProfile(left), b = algorithmProfile(right);
    if (!a || !b) return null;
    const overlap = (a: string[], b: string[]) => {const union = new Set([...a, ...b]); return union.size ? [...new Set(a)].filter(row => b.includes(row)).length / union.size : 0;};
    const axes = {mechanism: {weight: 30, similarity: Number(a.family !== 'other' && a.family === b.family)}, calculation: {weight: 25, similarity: overlap(a.operations, b.operations)},
        inputs: {weight: 20, similarity: overlap(a.inputs, b.inputs)}, output: {weight: 15, similarity: Number(left.outputType === right.outputType && left.units === right.units)},
        parameters: {weight: 10, similarity: overlap(a.parameters, b.parameters)}};
    return {method: 'source-algorithm-attributes-v1', score: Math.round(Object.values(axes).reduce((sum, axis) => sum + axis.weight * axis.similarity, 0) * 100) / 10000,
        axes, shared: {operations: a.operations.filter(row => b.operations.includes(row)), inputs: a.inputs.filter(row => b.inputs.includes(row)), parameters: a.parameters.filter(row => b.parameters.includes(row))}};
}
