import type React from 'react';
import type {MarketShop, MarketSupply} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {farmItemIcon} from '../Farm/assets';

export function MarketSupplies({shop, selectedId, onSelect}: {shop: MarketShop; selectedId: string; onSelect: (id: string) => void}) {
    const feed: MarketSupply = {id: 'feed', ...shop.feed, kind: 'feed'};
    const supplies = [feed, ...(shop.supplies || [])];

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (e.deltaY !== 0 && !e.deltaX) {
            e.currentTarget.scrollLeft += e.deltaY;
        }
    };

    return (
        <div className="shrink-0 border-t border-slate-100 pt-2">
            <p className="mb-1.5 text-[10px] text-slate-500">常驻农资 · 持续供应 · 不占随机商品格额度</p>
            <div
                onWheel={handleWheel}
                className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5"
            >
                {supplies.map(item => {
                    const isSelected = selectedId === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelect(item.id)}
                            className={`group relative flex shrink-0 items-center gap-2 rounded-xl border p-2 text-left transition-all outline-none cursor-pointer w-44 sm:w-48 ${
                                isSelected
                                    ? 'border-orange-400 bg-orange-50/40 shadow-xs ring-2 ring-orange-500/20'
                                    : 'border-slate-200 bg-white hover:border-orange-200 hover:shadow-2xs hover:bg-slate-50/40'
                            }`}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50/80 border border-slate-100 p-1">
                                <ItemIconImage
                                    src={farmItemIcon(item.sku)}
                                    alt={item.name}
                                    className="h-7 w-7"
                                    fallback={<span className="text-xs text-slate-400 font-medium">{item.kind === 'feed' ? '料' : '肥'}</span>}
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                    <span className="truncate text-xs font-bold text-slate-800">{item.name}</span>
                                    {item.kind === 'fertilizer' && (
                                        <span className="shrink-0 text-[9px] text-slate-400 font-normal">整点换价</span>
                                    )}
                                </div>
                                <div className="mt-0.5 flex items-baseline gap-0.5">
                                    <span className="text-xs font-extrabold text-orange-600 tabular-nums">
                                        {item.price}
                                    </span>
                                    <span className="text-[9px] text-orange-500/80">币/份</span>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
