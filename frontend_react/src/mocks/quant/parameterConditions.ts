import type {QuantAnalysis} from '../../types/api/quant';

/** Explicit synthetic fixture, not inferred semantics for arbitrary uploaded code. */
export function mockConditionalParameters(code: string): QuantAnalysis['parameters'] {
    const common = {category: 'signal' as const, constraints: '启用过滤时 lookback < slow', effect: '改变比较跨度', suggestion: '待验证的条件样例', evidence: '本地人工构造，未调用模型'};
    return [
        {...common, name: 'lookback', type: 'int', defaultValue: '20', meaning: '动量窗口', domain: {
            version: 2, minimum: 5, maximum: 60, step: 5, stepOrigin: 0, choices: [], relations: [],
            conditions: [{when: {operator: 'eq', left: {parameter: 'enabled'}, right: {value: true}},
                require: {operator: 'lt', left: {parameter: 'lookback'}, right: {parameter: 'slow'}}}],
            evidence: [{field: 'code', quote: code.slice(0, 500)}],
        }},
        {...common, name: 'slow', type: 'int', defaultValue: '30', meaning: '条件比较窗口'},
        {...common, name: 'enabled', type: 'bool', defaultValue: 'true', meaning: '是否启用声明约束'},
    ];
}

/** Only this explicit marker selects the artificial v4 arithmetic contract. */
export function mockArithmeticParameters(code: string): QuantAnalysis['parameters'] {
    const common = {category: 'signal' as const, constraints: 'enabled=true 时 lookback × 2 + slow ≤ 80',
        effect: '人工样例检查参数组合，不代表市场适用性', suggestion: '比较合规 lookback=15/20/25；30 仅作手工非法变体验证', evidence: 'LOCAL_ARITHMETIC_PARAMETERS 人工样例，未调用真实模型'};
    const quote = code.length <= 3000 ? code : code.split(/\r?\n/).find(line => line.includes('LOCAL_ARITHMETIC_PARAMETERS')) || 'LOCAL_ARITHMETIC_PARAMETERS';
    return [
        {...common, name: 'lookback', type: 'int', defaultValue: '20', meaning: '动量窗口（人工样例）', domain: {
            version: 4, minimum: 5, maximum: 60, step: 5, stepOrigin: 0, choices: [], relations: [],
            conditions: [{when: {operator: 'eq', left: {parameter: 'enabled'}, right: {value: true}}, require: {
                operator: 'lte', left: {operator: 'add', left: {operator: 'mul', left: {parameter: 'lookback'}, right: {value: 2}}, right: {parameter: 'slow'}}, right: {value: 80}}}],
            evidence: [{field: 'code', quote}],
        }},
        {...common, name: 'slow', type: 'int', defaultValue: '30', meaning: '组合约束中的慢窗口（人工样例）'},
        {...common, name: 'enabled', type: 'bool', defaultValue: 'true', meaning: '是否启用声明的组合约束'},
    ];
}
