import type {MarketShop, MarketSupply} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {farmItemIcon} from '../Farm/assets';

export function MarketSupplies({shop, selectedId, onSelect}: {shop: MarketShop; selectedId: string; onSelect: (id: string) => void}) {
    const feed: MarketSupply = {id: 'feed', ...shop.feed, kind: 'feed'};
    return <div className="shrink-0 border-t border-slate-100 pt-2">
        <p className="mb-1 text-[10px] text-slate-500">常驻农资 · 持续供应 · 不占随机商品格额度</p>
        <div className="grid grid-cols-3 gap-2">
            {[feed, ...(shop.supplies || [])].map(item => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`min-w-0 rounded-xl border p-2 text-left ${selectedId === item.id ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-1"><ItemIconImage src={farmItemIcon(item.sku)} alt={item.name} className="h-7 w-7 shrink-0" fallback={<span>肥</span>}/><span className="truncate text-xs font-semibold">{item.name}</span></div>
                <p className="mt-1 text-xs font-bold text-orange-700">{item.price} 币／份</p>
                {item.kind === 'fertilizer' && <p className="text-[10px] text-slate-500">整点换价</p>}
            </button>)}
        </div>
    </div>;
}
