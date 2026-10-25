/** Fabricated display data. No imported prices or real strategy execution. */
import type {QuantStrategyPolicy} from '../../types/api/quantStrategy';
import {strategySemantics} from '../../utils/quantStrategyExecution';
export function demoExecution(policy: QuantStrategyPolicy, total: number, dates: string[], full: boolean, baseline: boolean, feeBps = 5, slippageBps = 5) {
    const count = baseline ? 1 : Math.min(2, policy.maxEntries), feeRate = feeBps / 10000, slip = slippageBps / 10000;
    const trades = Array.from({length: count}, (_, index) => {
        const side = baseline || policy.direction !== 'short_only' ? 'long' : 'short';
        const entry = index * 2 + 1, exit = index === count - 1 ? 5 : entry + 1, net = total / count;
        const sign = side === 'long' ? 1 : -1, equity = 1 + index * net, entryFill = 100 * (1 + sign * slip);
        const notional = equity * policy.positionFraction / (1 + feeRate), quantity = notional / entryFill, entryFee = notional * feeRate;
        const borrow = side === 'short' ? quantity * 100 * policy.shortBorrowBpsPerBar / 10000 * (exit - entry) : 0;
        const exitFill = (sign * quantity * entryFill + net + entryFee + borrow) / (quantity * (sign - feeRate));
        const exitFee = quantity * exitFill * feeRate, exitRaw = exitFill / (1 - sign * slip), gross = net + entryFee + exitFee + borrow;
        return {id: `trade-${index + 1}`, side, entry_bar: entry, exit_bar: exit, signal_bar: entry - 1, entry_signal: true,
            entry_timestamp: dates[entry], exit_timestamp: dates[exit], entry_raw_price: 100, entry_fill_price: entryFill,
            exit_raw_price: exitRaw, exit_fill_price: exitFill,
            quantity, entry_equity: equity, position_fraction: policy.positionFraction, entry_fee: entryFee, exit_fee: exitFee, borrow_cost: borrow,
            gross_pnl: gross, net_pnl: net, exit_reason: 'boundary'};
    });
    return {version: 1, semantics: strategySemantics, policy_hash: '0'.repeat(64), baseline, status: 'completed', fees: trades.reduce((sum, row) => sum + row.entry_fee + row.exit_fee, 0), borrow_cost: trades.reduce((sum, row) => sum + row.borrow_cost, 0),
        realized_pnl: total, capital_deficit: 0, entry_budget_blocked_bars: 0, exit_reasons: {boundary: count}, ledger_scope: full ? 'full_trades' : 'summary_only', ...(full ? {trades} : {})};
}
