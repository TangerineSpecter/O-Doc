import {useState} from 'react';
import {RefreshCw, TrendingUp} from 'lucide-react';
import {useInvestment} from '../../hooks/useInvestment';
import type {InvestmentTab} from '../../types/api/investment';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {InvestmentPositions} from './InvestmentPositions';
import {InvestmentTrades, InvestmentDecisions} from './InvestmentRecords';
import {InvestmentDetail} from './InvestmentDetail';
import {investmentMoney, profitClass} from './presentation';
const tabs: Array<{value: InvestmentTab; label: string}> = [{value: 'positions', label: '当前持仓'}, {value: 'trades', label: '成交记录'}, {value: 'decisions', label: '投资决策'}];
export default function InvestmentDialog({onClose}: {onClose: () => void}) {
    const investment = useInvestment();
    const [detail, setDetail] = useState<string | null>(null);
    const current = investment.tab === 'positions' ? investment.positions : investment.tab === 'trades' ? investment.trades : investment.decisions;
    const summary = investment.overview;
    return <><WorldDialog title="股票投资" onClose={onClose} size="wide"><div className="space-y-5">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-orange-50 p-3 text-orange-600"><TrendingUp className="h-5 w-5"/></div><div><p className="text-sm font-semibold text-slate-800">跟随市场，记录居民的投资选择</p><p className="mt-1 text-xs leading-relaxed text-slate-500">沪深 A 股 · 最近交易日收盘价模拟成交 · 最少1股 · T+1 · 手续费0</p><p className="mt-1 text-xs text-slate-400">当日新买股份按成交价估值，浮盈从买入日之后的估值起计。模拟价差收益，未计分红送转。请先在设置 → Agent → 任务配置「A 股投资」。</p></div></div>
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1 sm:max-w-64"><Select menuPortal value={investment.actorId} onChange={value => {setDetail(null); investment.setActorId(value);}} options={investment.residents.map(r => ({value: r.id, label: r.name}))} placeholder="选择投资居民"/></div><button type="button" onClick={investment.refresh} aria-label="刷新投资账户" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><RefreshCw className={`h-4 w-4 ${investment.loading ? 'animate-spin' : ''}`}/></button></div>
        {summary && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[{label: '可用余额', value: summary.balance}, {label: '持仓市值', value: summary.marketValue}, {label: '浮动盈亏', value: summary.unrealizedProfit, profit: true}, {label: '已实现盈亏', value: summary.realizedProfit, profit: true}].map(s => <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-400">{s.label}</p><p className={`mt-2 break-all text-lg font-bold tabular-nums ${s.profit ? profitClass(s.value) : 'text-slate-800'}`}>{investmentMoney(s.value)}</p></div>)}</div>}
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">{tabs.map(t => <button type="button" key={t.value} onClick={() => investment.setTab(t.value)} aria-pressed={investment.tab === t.value} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${investment.tab === t.value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{t.label}</button>)}</div>
        {investment.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{investment.error}</p>}
        {investment.loading && !current ? <p className="py-12 text-center text-sm text-slate-400">正在加载投资账户…</p> : !current?.items.length ? <p className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">{!investment.residents.length ? '配置投资任务后，在这里查看居民的股票资产' : investment.tab === 'positions' ? '目前没有股票持仓' : '暂无投资记录'}</p> : investment.tab === 'positions' ? <InvestmentPositions items={investment.positions?.items || []} onDetail={setDetail}/> : investment.tab === 'trades' ? <InvestmentTrades items={investment.trades?.items || []}/> : <InvestmentDecisions items={investment.decisions?.items || []}/>}
        {current && current.total > 20 && <div className="flex items-center justify-center gap-4 text-xs text-slate-500"><button type="button" disabled={investment.page <= 1} onClick={() => investment.setPage(investment.page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">上一页</button><span>第 {investment.page} 页 · 共 {current.total} 条</span><button type="button" disabled={investment.page * 20 >= current.total} onClick={() => investment.setPage(investment.page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">下一页</button></div>}
    </div></WorldDialog>{detail && <InvestmentDetail actorId={investment.actorId} code={detail} onClose={() => setDetail(null)}/>}</>;
}
