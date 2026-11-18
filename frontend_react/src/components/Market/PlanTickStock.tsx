import type {MarketTickStock} from './marketTickDetails';
import {marketSkuName} from './marketPresentation';

export function PlanTickStock({rows, itemNames}: {rows: MarketTickStock[]; itemNames: Record<string, string>}) {
    if (!rows.length) return null;
    return <details className="w-full rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700">
        <summary className="cursor-pointer font-medium">查看库存处置明细</summary>
        <ul className="mt-2 space-y-2">{rows.map(row => <li key={row.sku}>
            <p className="font-semibold" title={row.sku}>{marketSkuName(row.sku, itemNames)}</p>
            <p className="mt-0.5 tabular-nums">拟回收 {row.sell} 件 · 拟挂牌 {row.list} 件</p>
            <p className="tabular-nums">已回收 {row.sold} 件 · 已挂牌 {row.listed} 件</p>
            {row.expiredReturn > 0 && <p>预检时到期退回超量 {row.expiredReturn} 件</p>}
            {row.blockedListing > 0 && <p className="text-amber-800">到期退回无法自动重挂 {row.blockedListing} 件</p>}
        </li>)}</ul>
    </details>;
}
