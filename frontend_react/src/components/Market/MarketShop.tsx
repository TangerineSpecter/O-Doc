import {useEffect, useState} from 'react';
import {Package, Sprout} from 'lucide-react';
import type {MarketShop as Shop} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {marketMoney} from './marketPresentation';

export function MarketShop({shop}: {shop: Shop}) {
    const [remaining, setRemaining] = useState(0);
    useEffect(() => {
        const started = Date.now();
        const duration = Date.parse(shop.expiresAt)-Date.parse(shop.serverTime);
        const tick = () => setRemaining(Math.max(0, Math.ceil((duration-(Date.now()-started))/1000)));
        tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
    }, [shop.expiresAt, shop.serverTime]);
    return <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>全体居民共享库存 · 售罄后等待下一批</span><span className="rounded-full bg-emerald-50 px-3 py-1 font-medium tabular-nums text-emerald-700">距离刷新 {Math.floor(remaining/60)}分{remaining%60}秒</span></div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{shop.slots.map(slot => <article key={slot.id} className={`rounded-xl border p-3 transition-colors ${slot.remainingQuantity ? 'border-slate-200 bg-white shadow-xs' : 'border-slate-100 bg-slate-50 text-slate-400'}`}>
            <div className="mb-2 flex h-14 items-center justify-center rounded-lg bg-lime-50/60"><ItemIconImage src={farmItemIcon(slot.sku)} alt={slot.name} className="h-9 w-9" fallback={slot.sku.startsWith('animal.') ? <Package className="h-7 w-7 text-lime-500"/> : <Sprout className="h-7 w-7 text-lime-500"/>}/></div>
            <p className="truncate text-xs font-semibold text-slate-800">{slot.name}</p><p className="mt-0.5 text-xs font-bold text-emerald-700">{marketMoney(slot.price)} <span className="text-[10px] font-normal text-emerald-600/80">世界币／份</span></p>
            <div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-slate-400">商品位 {Number(slot.id)+1}</span><span className={slot.remainingQuantity ? 'font-medium text-slate-600' : 'text-slate-400'}>{slot.remainingQuantity ? `剩余 ${slot.remainingQuantity} 份` : '已售罄'}</span></div>
        </article>)}</div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3"><div className="flex items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100/60"><ItemIconImage src={farmItemIcon('feed')} alt="饲料" className="h-6 w-6" fallback={<Package className="h-5 w-5 text-amber-500"/>}/></div><div><p className="text-xs font-semibold text-slate-800">常驻饲料</p><p className="text-[11px] text-slate-500">持续供应，不占随机商品位</p></div></div><span className="text-xs font-bold text-amber-700">{marketMoney(shop.feed.price)} <span className="text-[10px] font-normal text-amber-600/80">世界币／份</span></span></div>
    </div>;
}
