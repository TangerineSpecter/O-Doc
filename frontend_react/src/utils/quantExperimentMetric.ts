import type {QuantStrategyPolicy, StrategyExecution} from '../types/api/quantStrategy';
import {readStrategyExecution} from './quantStrategyExecution';
export interface Metric {missingSignals?: number; execution?: StrategyExecution; totalReturn: number; maxDrawdown: number; turnover: number; entries: number; start: string; end: string; curve: {timestamp: string; equity: number}[]}
const object=(value: unknown): Record<string, unknown> => {if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('对象字段无效'); return value as Record<string, unknown>;};
const text=(v: unknown): string => {if (typeof v !== 'string') throw new Error('文本字段无效'); return v;};
const number=(v: unknown): number => {if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('数值字段无效'); return v;};
const array=(v: unknown,max: number): unknown[] => {if (!Array.isArray(v) || v.length>max) throw new Error('列表字段无效');return v;};
export function readMetric(value: unknown, strategy?: QuantStrategyPolicy, baseline = false): Metric | undefined {
    if (value === null || value === undefined) return undefined;
    const item = object(value);
    const curve = item.curve === undefined ? [] : array(item.curve, 20001).map(point => {const row = object(point); return {timestamp: text(row.timestamp), equity: number(row.equity)};});
    if (!strategy && item.execution !== undefined) throw new Error('旧引擎不能携带策略账本');
    const execution = strategy ? readStrategyExecution(item.execution, number(item.entries), item.curve !== undefined, baseline) : undefined;
    return {missingSignals: item.missing_signals === undefined ? undefined : number(item.missing_signals), execution, totalReturn: number(item.total_return), maxDrawdown: number(item.max_drawdown), turnover: number(item.turnover), entries: number(item.entries), start: text(item.start), end: text(item.end), curve};
}
