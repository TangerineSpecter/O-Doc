export type QuantExportTarget = 'python' | 'pine' | 'mql4' | 'tongdaxin';
export interface QuantExportBundle {filename: string; code: string; manifestJson: string}
export const quantExportTargets = [{value: 'python', label: 'Python · 独立计算 / 聚宽数据调用'}, {value: 'pine', label: 'Pine v6 · 指标'}, {value: 'mql4', label: 'MQL4 · 指标（非 EA）'}, {value: 'tongdaxin', label: '通达信 · 副图指标'}];
