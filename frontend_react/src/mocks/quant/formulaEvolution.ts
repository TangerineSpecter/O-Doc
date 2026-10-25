/** Builds illustrative formulas only; no prices, fitness or selection are calculated. */
import type {QuantExperimentInput, QuantFormulaTransform} from '../../types/api/quantExperiment';
import type {QuantFactorCandidate} from '../../types/api/quant';
import {transformationSnapshot} from '../../utils/quantEvolution';
type Node = Record<string, unknown>;
export interface MockFormulaSeed {candidate: QuantFactorCandidate['data']; bindings: Record<string, string>; parameters: Record<string, number | boolean | string>}
export function mockFormulaEvolution(input: QuantExperimentInput, seeds: MockFormulaSeed[]) {
    const policy = input.config.evolution;
    if (!policy || !seeds[0]) return undefined;
    const op = policy.operators.find(op => ['lag', 'smooth', 'zscore', 'ts_rank'].includes(op)) || policy.operators[0];
    const unary = ['lag', 'smooth', 'zscore', 'ts_rank'].includes(op);
    const parents = unary ? seeds.slice(0, 1) : seeds.slice(0, 2);
    const transformation: QuantFormulaTransform = {version: policy.version, operator: op, window: unary || op === 'residual' ? policy.windows[0] : null, weight: op === 'weighted_mean' ? policy.weights[0] : null};
    const node = (op: string, ...args: Node[]): Node => ({op, args});
    const constant = (value: number): Node => ({op: 'constant', value});
    const parameters: Record<string, number | boolean | string> = {}, bindings: Record<string, string> = {};
    const expressions = parents.map((seed, index) => {
        const prefix = unary ? '' : index === 0 ? 'a_' : 'b_';
        const rename = (value: Node): Node => ({...value, ...(['input', 'parameter'].includes(String(value.op)) ? {name: prefix + value.name} : {}), ...(Array.isArray(value.args) ? {args: value.args.map(rename)} : {})});
        Object.assign(parameters, Object.fromEntries(Object.entries(seed.parameters).map(([key, value]) => [prefix + key, value])));
        Object.assign(bindings, Object.fromEntries(Object.entries(seed.bindings).map(([key, value]) => [prefix + key, value])));
        return rename(seed.candidate.expression || {op: 'input', name: Object.keys(seed.bindings)[0]});
    });
    const [a, b] = expressions, window = constant(transformation.window || 1);
    let expression = a, reason = '';
    const kind = parents[0].candidate.outputType;
    if (!unary && parents.length < 2) reason = '本地演示：此变换需要两个不同父代';
    else if (op === 'gate' && parents[1].candidate.outputType !== 'boolean_series') reason = '本地演示：门控的第二父代须为布尔条件';
    else if (op !== 'gate' && op !== 'crossover' && (['and', 'or'].includes(op) ? parents.some(p => p.candidate.outputType !== 'boolean_series') : op !== 'lag' && parents.some(p => p.candidate.outputType !== 'numeric_series'))) reason = '本地演示：父代类型不符合所选算子';
    else if (['mean', 'weighted_mean'].includes(op) && parents[0].candidate.units !== parents[1].candidate.units) reason = '本地演示：父代单位不一致';
    else if (op === 'crossover') {
        transformation.recipientPath = [0]; transformation.donorPath = [];
        if (a.op === 'sub' && Array.isArray(a.args) && a.args[0]?.op === 'div' && b?.op === 'sub' && Array.isArray(b.args) && b.args[0]?.op === 'div'
            && parents.every(p => p.candidate.outputType === 'numeric_series' && p.candidate.units === '比率')) expression = node('sub', b, a.args[1]);
        else reason = '本地演示：交叉样例只支持两个比率公式；真实类型与单位由后端检查';
    }
    else if (op === 'lag' || op === 'smooth') expression = node(op === 'lag' ? 'lag' : 'sma', a, window);
    else if (op === 'zscore') expression = node('div', node('sub', a, node('sma', a, window)), node('std', a, window));
    else if (op === 'ts_rank') expression = node('ts_rank', a, window);
    else if (op === 'gate') expression = node('gate', a, b);
    else if (op === 'and' || op === 'or') expression = node(op, a, b);
    else if (op === 'mean') expression = node('div', node('add', a, b), constant(2));
    else if (op === 'weighted_mean') expression = node('add', node('mul', constant(transformation.weight!), a), node('mul', constant(1 - transformation.weight!), b));
    else {
        const ma = node('sma', a, window), mb = node('sma', b, window);
        const cov = node('sub', node('sma', node('mul', a, b), window), node('mul', ma, mb));
        const variance = node('sub', node('sma', node('mul', b, b), window), node('mul', mb, mb));
        expression = node('sub', a, node('add', ma, node('mul', node('div', cov, variance), node('sub', b, mb))));
    }
    const count = (value: Node): number => 1 + (Array.isArray(value.args) ? value.args.reduce((sum, child) => sum + count(child), 0) : 0);
    if (!reason && count(expression) > policy.maxNodes) reason = '本地演示：新公式超过配置节点上限';
    if (op === 'crossover') {transformation.recipientPath ??= [0]; transformation.donorPath ??= [];}
    return {transformation: transformationSnapshot(transformation), parents: parents.map((_, index) => `attempt-${index + 1}`), reason,
        recipe: {expression, parameters, bindings, output_type: kind, units: ['zscore', 'ts_rank'].includes(op) ? 'dimensionless' : parents[0].candidate.units}, complexity: count(expression)};
}
