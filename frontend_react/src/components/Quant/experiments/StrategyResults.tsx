import {useState} from 'react';
import type {QuantStrategyPolicy, StrategyExecution} from '../../../types/api/quantStrategy';
import {QuantButton} from '../ui';
const n = (v: number) => v.toLocaleString(undefined, {maximumFractionDigits: 8});
const pct = (v: number) => `${n(v * 100)}%`;
const reasons: Record<string, string> = {signal_exit: '信号退出', signal_reverse: '信号反向', missing_signal: '信号缺失', stop_loss: '止损', take_profit: '止盈', gap_stop_loss: '跳空止损', gap_take_profit: '跳空止盈', max_holding: '持有期上限', boundary: '区间末尾', insolvent_open: '开盘资金耗尽', insolvent_borrow: '借券费用后资金耗尽', insolvent_exit: '平仓后资金耗尽'};
export function StrategySummary({policy, threshold}: {policy: QuantStrategyPolicy; threshold: number}) {
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label="冻结策略规则"><h4 className="text-sm font-semibold">策略执行规则 · 本批固定假设</h4><dl className="grid gap-x-6 gap-y-3 text-xs leading-6 sm:grid-cols-2">{[
        ['允许方向', {long_only: '只做多', short_only: '只做空', long_short: '允许多空'}[policy.direction]],
        ['数值信号', `多头入场＞${n(threshold)}，退出≤${n(policy.longExitThreshold)}；空头入场＜${n(policy.shortEntryThreshold)}，退出≥${n(policy.shortExitThreshold)}`],
        ['布尔信号', `true触发${policy.booleanSide === 'long' ? '多头' : '空头'}，false空仓`], ['仓位', `开仓时净值的${pct(policy.positionFraction)}，持有期间数量固定`],
        ['止损 / 止盈', `${policy.stopLossFraction === null ? '停用' : pct(policy.stopLossFraction)} / ${policy.takeProfitFraction === null ? '停用' : pct(policy.takeProfitFraction)}`],
        ['持有与冷却', `持有${policy.maxHoldingBars ? `最多${policy.maxHoldingBars}柱` : '不设柱数上限'}，退出后冷却${policy.cooldownBars}柱`], ['开仓上限', `每段${policy.maxEntries}次；同开盘反向${policy.sameOpenReversal ? '允许' : '不允许'}`],
        ['做空借券费', `每根持有柱${n(policy.shortBorrowBpsPerBar)}bps`],
    ].map(([label, value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="break-words text-slate-700">{value}</dd></div>)}</dl><p className="text-xs leading-6 text-slate-500">仅允许方向内的规则生效。上一收盘信号在下一开盘决策；同柱止损先行，跳空止损按开盘、止盈按目标价，再计不利滑点与费用。买入持有对照沿用仓位和费用，停用信号退出、止损止盈和持有期限制。原平台、手数、保证金及实际账户等价性仍待验证。</p></section>;
}
export function StrategyLedger({execution, label}: {execution?: StrategyExecution; label: string}) {
    const [page, setPage] = useState(0);
    if (!execution) return null;
    const trades = execution.trades || [], offset = Math.min(page * 10, Math.max(0, Math.ceil(trades.length / 10) - 1) * 10);
    return <section className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label={`${label}执行记录`}><h4 className="text-sm font-semibold">{label} · {execution.ledgerScope === 'full_trades' ? '成交账本' : '执行摘要'}</h4>
        <p className="text-xs leading-6 text-slate-600">手续费 {n(execution.fees)} · 借券费用 {n(execution.borrowCost)} · 已实现净损益 {n(execution.realizedPnl)}。金额以本段初始资金=1计，数量为参考分数数量。开仓次数限制阻止了 {execution.entryBudgetBlockedBars} 根信号。</p>
        {execution.status === 'insolvent' && <p role="status" className="rounded-lg bg-red-50 p-3 text-xs leading-6 text-red-700">净值已耗尽，本段停止开仓；资金缺口 {n(execution.capitalDeficit)}。负净值保留，未假定负余额保护；未模拟盘中保证金强平。</p>}
        <p className="text-xs leading-6 text-slate-500">退出原因：{Object.entries(execution.exitReasons).map(([key, count]) => `${reasons[key] || key} ${count}次`).join('；') || '暂无交易'}。回撤按开盘采样，不能表示真实盘中最大回撤。</p>
        {execution.ledgerScope === 'summary_only' ? <p className="text-xs text-slate-400">训练与验证保存逐尝试汇总；选中方案的留出评价保存完整成交记录。</p> : <details className="space-y-3"><summary className="cursor-pointer text-xs font-semibold text-orange-700">查看 {trades.length} 笔成交明细</summary>{!trades.length ? <p className="text-xs text-slate-400">本段未入场。</p> : <><div className="space-y-3">{trades.slice(offset, offset + 10).map(row => <article key={row.id} className="rounded-lg bg-slate-50 p-3 text-xs leading-6"><div className="flex flex-wrap justify-between gap-2 font-semibold"><span>{row.id} · {row.side === 'long' ? '多头' : '空头'} · {reasons[row.exitReason] || row.exitReason}</span><span>净损益 {n(row.netPnl)}</span></div><p className="break-all text-slate-500">{row.entryTimestamp} → {row.exitTimestamp}</p><dl className="grid gap-x-5 gap-y-1 sm:grid-cols-2">{[
            ['信号 / 入场 / 退出柱', `${row.signalBar} / ${row.entryBar} / ${row.exitBar}（从0计）`], ['上一收盘信号值', String(row.entrySignal)],
            ['入场参考价 → 成交价', `${n(row.entryRawPrice)} → ${n(row.entryFillPrice)}`], ['退出参考价 → 成交价', `${n(row.exitRawPrice)} → ${n(row.exitFillPrice)}`],
            ['固定数量 / 入场净值', `${n(row.quantity)} / ${n(row.entryEquity)}`], ['入场费 / 退出费 / 借券费', `${n(row.entryFee)} / ${n(row.exitFee)} / ${n(row.borrowCost)}`],
        ].map(([key, value]) => <div key={key}><dt className="text-slate-400">{key}</dt><dd className="break-words text-slate-700">{value}</dd></div>)}</dl></article>)}</div>{trades.length > 10 && <div className="flex flex-wrap items-center gap-3"><QuantButton disabled={!offset} onClick={() => setPage(Math.max(0, page - 1))}>上一页成交</QuantButton><span className="text-xs text-slate-400">{offset + 1}–{Math.min(offset + 10, trades.length)} / {trades.length}</span><QuantButton disabled={offset + 10 >= trades.length} onClick={() => setPage(page + 1)}>下一页成交</QuantButton></div>}</>}</details>}
    </section>;
}
