import type {QuantFactorData} from '../types/api/quant';
import type {PortableQualification} from '../types/api/quantVerification';

export interface FactorNextStep {title: string; detail: string; action: 'source' | 'versions' | 'configuration'}

/** Readiness follows the saved structural check; it never grants empirical validation. */
export function factorReadiness(value: PortableQualification) {
    const steps: FactorNextStep[] = [];
    const expression = value.checks.find(row => row.code === 'expression' && row.status !== 'passed');
    if (expression) steps.push({title: '补齐可计算公式', detail: '从源码补齐计算语义；涉及内部状态时，需要初始化、逐根更新和缺失值规则。', action: 'versions'});
    for (const check of value.checks.filter(row => row.status !== 'passed' && row !== expression)) {
        steps.push({title: '修正公式引用或类型', detail: check.message, action: 'versions'});
    }
    if (value.inputs_requiring_mapping.length) steps.push({title: '明确输入来源',
        detail: `${value.inputs_requiring_mapping.join('、')}：补充对应数据列或上游计算定义；名称本身不能确定它如何从行情产生。`, action: 'source'});
    if (value.configuration.status !== 'declared_defaults_valid') steps.push({title: value.configuration.status === 'needs_values' ? '补齐运行参数' : '修正默认参数',
        detail: value.configuration.missing.length ? `尚缺：${value.configuration.missing.join('、')}。在公式版本或实验配置中明确提供。` : '默认配置未通过声明约束，请核对参数类型、范围和条件。', action: 'configuration'});
    return {title: value.blockers.length ? '定义尚不能用于自动实验' : value.automatic_experiment_ready ? '定义已具备自动实验条件' : '定义结构完整，运行条件待确认', steps};
}

export const factorRolePurpose: Record<QuantFactorData['role'], string> = {
    factor: '计算数值特征；预测目标、评价区间和信息增量需在实验中明确。',
    signal: '判断条件是否触发；布尔条件本身不确定交易方向、持有期或收益。',
    filter: '筛选允许参与的时点或样本；需要结合明确的研究规则评价。',
    risk: '约束仓位或风险；不自动作为收益预测因子参与实验。',
    execution: '描述执行规则；不自动作为收益预测因子参与实验。',
    display: '用于显示或提示；不自动作为收益预测因子参与实验。',
};

export function factorListStatus(data: QuantFactorData, fallback: string) {
    return !data.expression ? '缺少可计算定义' : fallback;
}
