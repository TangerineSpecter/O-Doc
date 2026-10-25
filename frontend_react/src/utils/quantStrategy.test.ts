import assert from 'node:assert/strict';
import {test} from 'node:test';
import {strategyDraft, buildStrategy, strategySnapshot, readStrategy} from './quantStrategy.ts';
import {readStrategyExecution} from './quantStrategyExecution.ts';
import {demoExecution} from '../mocks/quant/strategyExecution.ts';
const policy = () => {const draft = strategyDraft(); draft.enabled = true; draft.values.positionPercent = '50'; return buildStrategy(draft, 0)!;};
test('strategy drafts keep disabled legacy behavior and explicit null risk settings', () => {
    assert.equal(buildStrategy(strategyDraft(), 0), undefined);
    const v = policy(); assert.equal(v.positionFraction, .5); assert.equal(v.stopLossFraction, null);
    assert.deepEqual(readStrategy(strategySnapshot(v), 0), v);
    assert.deepEqual(buildStrategy(strategyDraft(v), 0), v);
});
test('strategy refuses contradictory thresholds, nonpositive short profit targets, untyped values and absent fields', () => {
    const v = strategySnapshot(policy());
    for (const changes of [{version: true}, {max_entries: false}, {stop_loss_fraction: 0}, {direction: 'long_short', short_entry_threshold: 0}, {direction: 'long_short', take_profit_fraction: 1}, {same_open_reversal: true, cooldown_bars: 1}, {position_fraction: Infinity}, {extra: 1}]) assert.throws(() => readStrategy({...v, ...changes}, 0));
    const draft = strategyDraft(policy()); draft.stopEnabled = true; assert.throws(() => buildStrategy(draft, 0));
});
test('execution decoder binds ledger shape to scope and baseline, rejects malformed trade identities and amounts', () => {
    const raw = demoExecution(policy(), .04, Array.from({length: 6}, (_, i) => String(i)), true, false);
    assert.equal(readStrategyExecution(raw, 2, true).trades?.length, 2);
    assert.throws(() => readStrategyExecution(raw, 2, false)); assert.throws(() => readStrategyExecution(raw, 2, true, true));
    for (const change of [{fees: -1}, {version: true}, {semantics: 'unknown'}, {policy_hash: 'x'}, {exit_reasons: {invented: 2}}]) assert.throws(() => readStrategyExecution({...raw, ...change}, 2, true));
    const bad = structuredClone(raw); bad.trades![0].signal_bar = bad.trades![0].entry_bar; assert.throws(() => readStrategyExecution(bad, 2, true));
    const unknown = structuredClone(raw); unknown.trades![0].exit_reason = 'guaranteed_fill'; assert.throws(() => readStrategyExecution(unknown, 2, true));
});

test('synthetic ledger uses fractional sizing and reconciles short cash flows without pretending to backtest prices', () => {
    const p = {...policy(), direction: 'short_only' as const, booleanSide: 'short' as const, shortBorrowBpsPerBar: 2};
    const raw = demoExecution(p, .02, Array.from({length: 6}, (_, i) => String(i)), true, false, 7, 13);
    const ledger = readStrategyExecution(raw, 2, true);
    for (const t of ledger.trades!) {
        assert.ok(Math.abs(t.quantity * t.entryFillPrice * 1.0007 - t.entryEquity * p.positionFraction) < 1e-10);
        assert.ok(Math.abs((t.entryFillPrice - t.exitFillPrice) * t.quantity - t.grossPnl) < 1e-10);
        assert.ok(Math.abs(t.grossPnl - t.entryFee - t.exitFee - t.borrowCost - t.netPnl) < 1e-10);
        assert.ok(t.exitFillPrice > 0);
    }
    assert.ok(Math.abs(ledger.trades!.reduce((sum,t)=>sum+t.netPnl,0)-ledger.realizedPnl) < 1e-10);
});
