import type {InventoryPurpose, MarketAutomationDisposition} from '../../types/api/market';
import {marketSkuName} from './marketPresentation';

const purposeLabels: Record<InventoryPurpose, string> = {alchemy: '炼金', cooking: '烹饪', forge: '锻造', selfUse: '自用'};
type Props = {row: MarketAutomationDisposition; itemNames: Record<string, string>; variant?: 'compact' | 'full'};

export function PlanDispositionItem({row, itemNames, variant = 'compact'}: Props) {
    const strategy = row.strategy?.version === 1 ? row.strategy : undefined;
    const state = row.protection;
    const pending = !strategy || row.reviewStatus === 'review' || row.status === 'review';
    const count = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('zh-CN');
    return <article className={`rounded-xl border bg-white ${variant === 'full' ? 'p-4' : 'p-3'} ${pending ? 'border-amber-200' : 'border-slate-200'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800">{marketSkuName(row.sku, itemNames)}</span>
            <span className={`text-[11px] ${pending ? 'text-amber-700' : 'text-slate-500'}`}>
                {pending ? '待复核' : '今日已复核'}{row.reviewedDate ? ` · ${row.reviewedDate}` : ''}
            </span>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px] tabular-nums">
            <div><dt className="text-slate-500">现有数量</dt><dd className="mt-0.5 font-semibold text-slate-800">{count(state?.total)}</dd></div>
            <div><dt className="text-slate-500">实际保护</dt><dd className="mt-0.5 font-semibold text-slate-800">{count(state?.protected)}</dd></div>
            <div><dt className="text-slate-500">可处置</dt><dd className="mt-0.5 font-semibold text-orange-700">{count(state?.disposable)}</dd></div>
        </dl>
        {state && Object.keys(state.uses).length > 0 && <div className="mt-3 overflow-x-auto scrollbar-hide">
            <table className="w-full text-[11px] tabular-nums"><caption className="sr-only">用途目标与未执行需求</caption>
                <thead className="text-slate-500"><tr><th className="py-1 text-left font-medium">用途</th><th className="text-right font-medium">目标</th><th className="text-right font-medium">已排需求</th><th className="text-right font-medium">保护</th><th className="text-right font-medium">缺口</th></tr></thead>
                <tbody>{Object.entries(state.uses).map(([purpose, use]) => <tr key={purpose} className="text-slate-700">
                    <th className="py-1 text-left font-medium">{purposeLabels[purpose as InventoryPurpose]}</th>
                    <td className="text-right">{use.target}</td><td className="text-right">{use.committed}</td><td className="text-right">{use.protected}</td>
                    <td className={`text-right ${use.missing ? 'text-amber-700' : ''}`}>{use.missing}</td>
                </tr>)}</tbody>
            </table>
        </div>}
        {strategy ? <div className="mt-2 space-y-1 text-[11px] text-slate-600">
            <p>目标 {Object.entries(strategy.targets).map(([purpose, n]) => `${purposeLabels[purpose as InventoryPurpose]} ${n} 件`).join(' · ')}</p>
            {!row.sku.startsWith('combat.material.') && <p>保留{strategy.retainOrder === 'high' ? '高' : '低'}星优先 · 超量{row.starOrder === 'high' ? '高' : '低'}星优先</p>}
            <p>超量出售 {row.sellRatio}% · 挂牌 {row.listRatio}%{row.listRatio > 0 ? ` · 基准价 × ${row.listPriceRatio}` : ''}</p>
        </div> : <p className="mt-2 text-[11px] text-slate-500">旧标记等待制定用途目标，期间保留库存。</p>}
        {(state?.blockedReason || row.reason && pending) && <p role="note" className="mt-2 break-words rounded-lg bg-amber-50 p-2 text-[11px] text-amber-800">
            {state?.blockedReason || row.reason}{state?.blockedListing ? `（${state.blockedListing} 件）` : ''}
        </p>}
    </article>;
}
