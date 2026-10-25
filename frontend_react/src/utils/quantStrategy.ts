import type {QuantStrategyPolicy} from '../types/api/quantStrategy';
const fields = {version: 'version', direction: 'direction', booleanSide: 'boolean_side', shortEntryThreshold: 'short_entry_threshold',
    longExitThreshold: 'long_exit_threshold', shortExitThreshold: 'short_exit_threshold', positionFraction: 'position_fraction',
    stopLossFraction: 'stop_loss_fraction', takeProfitFraction: 'take_profit_fraction', maxHoldingBars: 'max_holding_bars',
    cooldownBars: 'cooldown_bars', maxEntries: 'max_entries', shortBorrowBpsPerBar: 'short_borrow_bps_per_bar', sameOpenReversal: 'same_open_reversal'} as const;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function validateStrategy(value: QuantStrategyPolicy, threshold: number): QuantStrategyPolicy {
    if (!value || value.version !== 1 || Object.keys(value).sort().join(',') !== Object.keys(fields).sort().join(',')) throw new Error('策略规则版本或字段不完整');
    if (!['long_only', 'short_only', 'long_short'].includes(value.direction) || !['long', 'short'].includes(value.booleanSide)) throw new Error('请选择允许开仓的方向');
    if (value.direction === 'long_only' && value.booleanSide !== 'long' || value.direction === 'short_only' && value.booleanSide !== 'short') throw new Error('布尔信号方向须符合允许开仓方向');
    if (![threshold, value.shortEntryThreshold, value.longExitThreshold, value.shortExitThreshold, value.positionFraction, value.shortBorrowBpsPerBar].every(finite)) throw new Error('策略阈值、仓位和费用须为有限数值');
    if (!(value.positionFraction > 0 && value.positionFraction <= 1) || value.shortBorrowBpsPerBar < 0 || value.shortBorrowBpsPerBar > 500) throw new Error('开仓比例为0–100%且须大于0，借券费用为每根0–500bps');
    if (value.direction !== 'short_only' && value.longExitThreshold > threshold) throw new Error('多头退出阈值不能高于入场阈值');
    if (value.direction !== 'long_only' && value.shortEntryThreshold > value.shortExitThreshold) throw new Error('空头退出阈值不能低于入场阈值');
    if (value.direction === 'long_short' && value.shortEntryThreshold >= threshold) throw new Error('多空入场阈值不能重叠');
    if (value.stopLossFraction !== null && (!finite(value.stopLossFraction) || value.stopLossFraction <= 0 || value.stopLossFraction >= 1)) throw new Error('止损比例须大于0且小于100%');
    if (value.takeProfitFraction !== null && (!finite(value.takeProfitFraction) || value.takeProfitFraction <= 0 || value.takeProfitFraction >= 10)) throw new Error('止盈比例须大于0且小于1000%');
    if (value.direction !== 'long_only' && value.takeProfitFraction !== null && value.takeProfitFraction >= 1) throw new Error('允许做空时止盈须小于100%，目标价格必须为正');
    for (const key of ['maxHoldingBars', 'cooldownBars', 'maxEntries'] as const) if (!Number.isInteger(value[key]) || value[key] < (key === 'maxEntries' ? 1 : 0) || value[key] > 2000) throw new Error('柱数为0–2000，开仓上限为1–2000');
    if (typeof value.sameOpenReversal !== 'boolean' || value.sameOpenReversal && value.cooldownBars !== 0) throw new Error('同开盘反向开仓要求冷却期为0');
    return value;
}
export function readStrategy(raw: unknown, threshold: number): QuantStrategyPolicy {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join(',') !== Object.values(fields).sort().join(',')) throw new Error('策略规则字段无效');
    const value = Object.fromEntries(Object.entries(fields).map(([key, name]) => [key, (raw as Record<string, unknown>)[name]])) as unknown as QuantStrategyPolicy;
    return validateStrategy(value, threshold);
}
export const strategySnapshot = (value: QuantStrategyPolicy) => Object.fromEntries(Object.entries(fields).map(([key, name]) => [name, value[key as keyof QuantStrategyPolicy]]));

export interface StrategyDraft {
    enabled: boolean; direction: QuantStrategyPolicy['direction']; booleanSide: QuantStrategyPolicy['booleanSide'];
    stopEnabled: boolean; profitEnabled: boolean; sameOpenReversal: boolean;
    values: Record<'shortEntry' | 'longExit' | 'shortExit' | 'positionPercent' | 'stopPercent' | 'profitPercent' | 'holding' | 'cooldown' | 'entries' | 'borrowBps', string>;
}
export function strategyDraft(value?: QuantStrategyPolicy, threshold = 0): StrategyDraft {
    return {enabled: !!value, direction: value?.direction || 'long_only', booleanSide: value?.booleanSide || 'long',
        stopEnabled: value?.stopLossFraction != null, profitEnabled: value?.takeProfitFraction != null, sameOpenReversal: value?.sameOpenReversal || false,
        values: {shortEntry: String(value?.shortEntryThreshold ?? threshold - 1), longExit: String(value?.longExitThreshold ?? threshold), shortExit: String(value?.shortExitThreshold ?? threshold),
            positionPercent: String((value?.positionFraction ?? 1) * 100), stopPercent: value?.stopLossFraction == null ? '' : String(value.stopLossFraction * 100),
            profitPercent: value?.takeProfitFraction == null ? '' : String(value.takeProfitFraction * 100), holding: String(value?.maxHoldingBars ?? 0),
            cooldown: String(value?.cooldownBars ?? 0), entries: String(value?.maxEntries ?? 1000), borrowBps: String(value?.shortBorrowBpsPerBar ?? 0)}};
}
export function buildStrategy(draft: StrategyDraft, threshold: number): QuantStrategyPolicy | undefined {
    if (!draft.enabled) return undefined;
    const number = (key: keyof StrategyDraft['values']) => {const raw = draft.values[key]; if (!raw.trim() || !Number.isFinite(Number(raw))) throw new Error('请完整填写策略规则；未知值不能以0代替'); return Number(raw);};
    return validateStrategy({version: 1, direction: draft.direction, booleanSide: draft.booleanSide, sameOpenReversal: draft.sameOpenReversal,
        shortEntryThreshold: number('shortEntry'), longExitThreshold: number('longExit'), shortExitThreshold: number('shortExit'),
        positionFraction: number('positionPercent') / 100, stopLossFraction: draft.stopEnabled ? number('stopPercent') / 100 : null,
        takeProfitFraction: draft.profitEnabled ? number('profitPercent') / 100 : null, maxHoldingBars: number('holding'), cooldownBars: number('cooldown'),
        maxEntries: number('entries'), shortBorrowBpsPerBar: number('borrowBps')}, threshold);
}
