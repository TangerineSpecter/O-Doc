import type {QuantFactorFamily, QuantFactorRole} from '../../types/api/quant';
export const factorRoles: Record<QuantFactorRole, string> = {factor: '计算因子', signal: '信号条件', filter: '过滤条件', risk: '风控模块', execution: '执行模块', display: '显示模块'};
export const factorFamilies: Record<QuantFactorFamily, string> = {momentum: '动量', trend: '趋势', volatility: '波动率', mean_reversion: '均值回归', volume: '量能', price_structure: '价格结构', fundamental: '基本面', other: '其他'};
export const factorOutputs = {numeric_series: '数值序列', boolean_series: '条件序列', scalar: '标量', platform_specific: '平台相关输出'};
