import {useState} from 'react';
import {Package, User, ArrowDownRight, ArrowUpRight} from 'lucide-react';
import {farmItemIcon} from '../Farm/assets';
import type {MarketListing} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {marketMoney, marketTime} from './marketPresentation';
import {MarketDetailSidebar} from './MarketDetailSidebar';

export function MarketListings({items}: {items: MarketListing[]}) {
    const [selectedId, setSelectedId] = useState<string>(items[0]?.id || '');
    const selectedListing = items.find(it => it.id === selectedId) || items[0] || null;

    if (!items.length) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <Package className="h-10 w-10 text-orange-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">暂无居民上架商品</p>
                <p className="mt-1 text-xs text-slate-400">居民在背包拥有多余物品或农产品时，会自行在此摆摊销售</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* 左侧：居民挂牌商品货架 */}
            <div className="flex h-full flex-col min-h-0 overflow-y-auto pr-1 scrollbar-hide space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                    {items.map(item => {
                        const isSelected = selectedId === item.id;
                        const isGold = item.item.source?.quality === 'gold';
                        const isSouvenir = item.item.kind === 'souvenir';
                        const hasRepriced = (item.history && item.history.length > 0) || Boolean(item.repricedAt);
                        const lastChange = item.history && item.history.length > 0 ? item.history[item.history.length - 1] : null;
                        const isPriceDrop = lastChange ? Number(lastChange.to) < Number(lastChange.from) : false;

                        return (
                            <div
                                key={item.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelectedId(item.id)}
                                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedId(item.id)}
                                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 outline-none cursor-pointer ${
                                    isSelected
                                        ? 'border-orange-400 bg-orange-50/20 shadow-md ring-2 ring-orange-500/20 -translate-y-0.5'
                                        : 'border-slate-200/90 bg-white hover:border-orange-200 hover:shadow-xs hover:bg-slate-50/30'
                                }`}
                            >
                                <div className="flex gap-3">
                                    {/* 物品图标舞台 */}
                                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-orange-100 bg-gradient-to-b from-orange-50/60 to-orange-100/30 p-2 shadow-xs group-hover:scale-105 transition-transform">
                                        <ItemIconImage
                                            src={item.item.iconAssetId ? `/api/resource/view/${item.item.iconAssetId}` : farmItemIcon(item.item.source?.sku || '')}
                                            alt={item.item.name}
                                            className="h-9 w-9"
                                            fallback={<Package className="h-6 w-6 text-orange-400" />}
                                        />
                                        {isGold && (
                                            <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 px-1 py-0.2 text-[8px] font-bold text-white shadow-xs">
                                                金色
                                            </span>
                                        )}
                                    </div>

                                    {/* 物品名称与摊主名牌 */}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span
                                                className={`rounded-md border px-1.5 py-0.2 text-[10px] font-medium leading-none ${
                                                    isGold
                                                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                                                        : isSouvenir
                                                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                                          : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                                }`}
                                            >
                                                {isGold ? '金色' : isSouvenir ? '纪念品' : '农产自营'}
                                            </span>
                                            <span className="flex items-center gap-0.5 text-[11px] text-slate-500 font-medium">
                                                <User className="h-3 w-3 text-slate-400" />
                                                {item.sellerName}
                                            </span>
                                        </div>

                                        {item.item.source?.sku?.startsWith('crop.') && <p className="text-[10px] text-slate-500">首批回收参考 {marketMoney(item.item.value)} 币／个 · 挂牌可溢价</p>}
                                        <h4 className="mt-1 text-xs font-bold text-slate-800 truncate" title={item.item.name}>
                                            {item.item.name} {item.item.source?.sku?.startsWith('crop.') ? `★${item.item.source.stars || 1}` : ''}
                                        </h4>

                                        <div className="mt-1 flex items-baseline justify-between">
                                            <div className="flex items-baseline gap-0.5">
                                                <span className="text-sm font-extrabold text-orange-600 tabular-nums">
                                                    {marketMoney(item.unitPrice)}
                                                </span>
                                                <span className="text-[10px] text-orange-500/80">世界币 / 份</span>
                                            </div>

                                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">
                                                余 {item.remainingQuantity} 份
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* 底部轻量标签行：改价信息与上架时间 */}
                                <div className="mt-3 flex items-center justify-between border-t border-slate-100/90 pt-2 text-[10px] text-slate-400">
                                    <span>上架 {marketTime(item.createdAt)}</span>

                                    {hasRepriced && (
                                        <span
                                            className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 font-medium ${
                                                isPriceDrop ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                            }`}
                                        >
                                            {isPriceDrop ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                                            {isPriceDrop ? '降价促销' : '价格微调'}
                                            {item.history?.length ? ` · ${item.history.length}次` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 右侧：挂牌物语与卖家档案 */}
            <div className="h-full min-h-0 hidden lg:block">
                <MarketDetailSidebar type="listing" listing={selectedListing} />
            </div>
        </div>
    );
}
