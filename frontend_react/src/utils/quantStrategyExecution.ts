import type {StrategyExecution, StrategyTrade} from '../types/api/quantStrategy';
export const strategySemantics = 'closed_signal_next_open_fixed_quantity_stop_first_gap_stop_open_gap_profit_limit_v1';
const object = (v: unknown): Record<string, unknown> => {if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('策略账本对象无效'); return v as Record<string, unknown>;};
const number = (v: unknown): number => {if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('策略账本数值无效'); return v;};
const text = (v: unknown): string => {if (typeof v !== 'string' || !v || v.length > 100) throw new Error('策略账本文字无效'); return v;};
const count = (v: unknown): number => {const n = number(v); if (!Number.isInteger(n) || n < 0 || n > 20000) throw new Error('策略账本计数无效'); return n;};
const fields = ['id', 'side', 'entry_bar', 'exit_bar', 'signal_bar', 'entry_signal', 'entry_timestamp', 'exit_timestamp', 'entry_raw_price', 'entry_fill_price', 'exit_raw_price', 'exit_fill_price', 'quantity', 'entry_equity', 'position_fraction', 'entry_fee', 'exit_fee', 'borrow_cost', 'gross_pnl', 'net_pnl', 'exit_reason'];
const reasons = ['signal_exit', 'signal_reverse', 'missing_signal', 'stop_loss', 'take_profit', 'gap_stop_loss', 'gap_take_profit', 'max_holding', 'boundary', 'insolvent_open', 'insolvent_borrow', 'insolvent_exit'];
function trade(raw: unknown): StrategyTrade {
    const v = object(raw);
    if (Object.keys(v).sort().join() !== [...fields].sort().join() || !['long', 'short'].includes(String(v.side)) || !reasons.includes(String(v.exit_reason))) throw new Error('策略成交字段或退出原因无效');
    const value: StrategyTrade = {id: text(v.id), side: v.side as StrategyTrade['side'], entryBar: count(v.entry_bar), exitBar: count(v.exit_bar), signalBar: count(v.signal_bar), entrySignal: v.entry_signal === null || typeof v.entry_signal === 'boolean' ? v.entry_signal : number(v.entry_signal),
        entryTimestamp: text(v.entry_timestamp), exitTimestamp: text(v.exit_timestamp), entryRawPrice: number(v.entry_raw_price), entryFillPrice: number(v.entry_fill_price), exitRawPrice: number(v.exit_raw_price), exitFillPrice: number(v.exit_fill_price),
        quantity: number(v.quantity), entryEquity: number(v.entry_equity), positionFraction: number(v.position_fraction), entryFee: number(v.entry_fee), exitFee: number(v.exit_fee), borrowCost: number(v.borrow_cost), grossPnl: number(v.gross_pnl), netPnl: number(v.net_pnl), exitReason: text(v.exit_reason)};
    if (value.signalBar !== value.entryBar - 1 || value.exitBar < value.entryBar || [value.entryRawPrice, value.entryFillPrice, value.exitRawPrice, value.exitFillPrice, value.quantity, value.entryEquity, value.positionFraction].some(n => n <= 0) || value.positionFraction > 1 || [value.entryFee, value.exitFee, value.borrowCost].some(n => n < 0)) throw new Error('策略成交时序或金额范围无效');
    return value;
}
export function readStrategyExecution(raw: unknown, entries: number, full: boolean, baseline = false): StrategyExecution {
    const v = object(raw);
    const keys = ['version', 'semantics', 'policy_hash', 'baseline', 'status', 'fees', 'borrow_cost', 'realized_pnl', 'capital_deficit', 'entry_budget_blocked_bars', 'exit_reasons', 'ledger_scope', ...(full ? ['trades'] : [])];
    if (Object.keys(v).sort().join() !== keys.sort().join() || v.version !== 1 || v.semantics !== strategySemantics || typeof v.policy_hash !== 'string' || !/^[a-f0-9]{64}$/.test(v.policy_hash) || v.baseline !== baseline || !['completed', 'insolvent'].includes(String(v.status)) || v.ledger_scope !== (full ? 'full_trades' : 'summary_only')) throw new Error('策略执行版本或范围无效');
    const exitReasons = Object.fromEntries(Object.entries(object(v.exit_reasons)).map(([key, n]) => {if (!reasons.includes(key) || !count(n)) throw new Error('策略退出计数无效'); return [key, count(n)];}));
    const trades = full && Array.isArray(v.trades) && v.trades.length <= 2000 ? v.trades.map(trade) : undefined;
    if (full && (!trades || trades.length !== entries || new Set(trades.map(row => row.id)).size !== trades.length) || Object.values(exitReasons).reduce((a, b) => a + b, 0) !== entries) throw new Error('策略账本数量不一致');
    const result: StrategyExecution = {version: 1, semantics: strategySemantics, policyHash: v.policy_hash, baseline, status: v.status as StrategyExecution['status'], fees: number(v.fees), borrowCost: number(v.borrow_cost), realizedPnl: number(v.realized_pnl), capitalDeficit: number(v.capital_deficit), entryBudgetBlockedBars: count(v.entry_budget_blocked_bars), exitReasons, ledgerScope: full ? 'full_trades' : 'summary_only', trades};
    if ([result.fees, result.borrowCost, result.capitalDeficit].some(n => n < 0)) throw new Error('策略费用不能为负');
    return result;
}
