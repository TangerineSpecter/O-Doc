import {Package} from 'lucide-react';
import {farmItemIcon} from '../Farm/assets';
import type {MarketListing} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {marketMoney, marketTime} from './marketPresentation';
export function MarketListings({items}: {items: MarketListing[]}) {
    return <div className="grid gap-3 sm:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex gap-3"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-orange-50"><ItemIconImage src={item.item.iconAssetId ? `/api/resource/view/${item.item.iconAssetId}` : farmItemIcon(item.item.source?.sku || '')} alt={item.item.name} fallback={<Package className="h-6 w-6 text-orange-400"/>}/></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.item.name}</p><p className="mt-1 text-xs text-slate-500">{item.sellerName} · {item.item.source?.quality === 'gold' ? '金色品质 · ' : item.item.kind === 'souvenir' ? '纪念品 · ' : '普通品质 · '}剩余 {item.remainingQuantity} 份</p><p className="mt-1 text-sm font-bold text-orange-600">{marketMoney(item.unitPrice)} 世界币／份</p></div></div>
        <div className="mt-3 flex flex-wrap justify-between gap-1 border-t border-slate-100 pt-3 text-[11px] text-slate-400"><span>上架 {marketTime(item.createdAt)}</span>{item.repricedAt && <span>改价 {marketTime(item.repricedAt)}</span>}</div>
        {item.history.length > 0 && <details className="mt-2 text-xs text-slate-500"><summary className="cursor-pointer">改价记录 · {item.history.length}次</summary>{item.history.map((r,index) => <p key={index} className="mt-2">{marketTime(r.at)} · {r.from} → {r.to} 世界币</p>)}</details>}
    </article>)}</div>;
}
