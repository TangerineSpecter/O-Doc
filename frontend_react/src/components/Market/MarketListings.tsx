import {Package} from 'lucide-react';
import {farmItemIcon} from '../Farm/assets';
import type {MarketListing} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {marketMoney, marketTime} from './marketPresentation';
export function MarketListings({items}: {items: MarketListing[]}) {
    return <div className="grid gap-2.5 sm:grid-cols-2">{items.map(item => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-orange-50"><ItemIconImage src={item.item.iconAssetId ? `/api/resource/view/${item.item.iconAssetId}` : farmItemIcon(item.item.source?.sku || '')} alt={item.item.name} className="h-8 w-8" fallback={<Package className="h-5 w-5 text-orange-400"/>}/></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{item.item.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{item.sellerName} · {item.item.source?.quality === 'gold' ? '金色品质 · ' : item.item.kind === 'souvenir' ? '纪念品 · ' : '普通品质 · '}剩余 {item.remainingQuantity} 份</p><p className="mt-0.5 text-xs font-bold text-orange-600">{marketMoney(item.unitPrice)} <span className="text-[10px] font-normal text-orange-500/80">世界币／份</span></p></div></div>
        <div className="mt-2 flex flex-wrap justify-between gap-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400"><span>上架 {marketTime(item.createdAt)}</span>{item.repricedAt && <span>改价 {marketTime(item.repricedAt)}</span>}</div>
        {item.history.length > 0 && <details className="mt-1.5 text-xs text-slate-500"><summary className="cursor-pointer">改价记录 · {item.history.length}次</summary>{item.history.map((r,index) => <p key={index} className="mt-1 text-[11px]">{marketTime(r.at)} · {r.from} → {r.to} 世界币</p>)}</details>}
    </article>)}</div>;
}
