import {useEffect, useState, useMemo} from 'react';
import {Package, Sprout, Clock, Wheat} from 'lucide-react';
import type {MarketShop as Shop, MarketTransaction} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {marketMoney} from './marketPresentation';
import {getSkuKnowledge} from './marketMetadata';
import {MarketDetailSidebar} from './MarketDetailSidebar';

interface MarketShopProps {
    shop: Shop;
    recentTransactions?: MarketTransaction[];
}

export function MarketShop({shop, recentTransactions = []}: MarketShopProps) {
    const [remaining, setRemaining] = useState(0);
    const [selectedSlotId, setSelectedSlotId] = useState<string | 'feed'>('0');
    const [filterCategory, setFilterCategory] = useState<'all' | 'seed' | 'animal'>('all');

    useEffect(() => {
        const started = Date.now();
        const duration = Date.parse(shop.expiresAt) - Date.parse(shop.serverTime);
        const tick = () => setRemaining(Math.max(0, Math.ceil((duration - (Date.now() - started)) / 1000)));
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [shop.expiresAt, shop.serverTime]);

    // 过滤商品
    const filteredSlots = useMemo(() => {
        return shop.slots.filter(slot => {
            if (filterCategory === 'seed') return slot.kind === 'seed';
            if (filterCategory === 'animal') return slot.kind === 'animal';
            return true;
        });
    }, [shop.slots, filterCategory]);

    // 当前选中的商品数据
    const isSelectedFeed = selectedSlotId === 'feed';
    const currentSelectedSlot = useMemo(() => {
        if (isSelectedFeed) return null;
        return shop.slots.find(s => s.id === selectedSlotId) || shop.slots[0] || null;
    }, [shop.slots, selectedSlotId, isSelectedFeed]);

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    return (
        <div className="grid h-full min-h-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] overflow-hidden">
            {/* 左侧：精巧货架展区（顶底固定，中间商品局部弹性滚动） */}
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
                {/* 1. 货架顶部状态栏：分类胶囊 + 补货倒计时 (shrink-0 固定，不滚动) */}
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 pb-1.5">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                        {(
                            [
                                {key: 'all', label: '全部现货', count: shop.slots.length},
                                {key: 'seed', label: '🌱 农田种苗', count: shop.slots.filter(s => s.kind === 'seed').length},
                                {key: 'animal', label: '🐑 牧场家畜', count: shop.slots.filter(s => s.kind === 'animal').length},
                            ] as const
                        ).map(cat => (
                            <button
                                key={cat.key}
                                type="button"
                                onClick={() => setFilterCategory(cat.key)}
                                className={`inline-flex items-center gap-1 whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                    filterCategory === cat.key
                                        ? 'bg-orange-50 text-orange-600 border border-orange-200/80 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <span>{cat.label}</span>
                                <span
                                    className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                        filterCategory === cat.key ? 'bg-orange-200/70 text-orange-800' : 'bg-slate-200/70 text-slate-500'
                                    }`}
                                >
                                    {cat.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-100/80">
                        <Clock className="h-3 w-3 text-emerald-600 animate-spin" style={{animationDuration: '8s'}} />
                        <span>下一批货架刷新：</span>
                        <span className="font-bold tabular-nums">
                            {minutes > 0 ? `${minutes}分` : ''}
                            {String(seconds).padStart(2, '0')}秒
                        </span>
                    </div>
                </div>

                {/* 2. 货架商品卡片网格 (唯一允许滚动的弹性区域：flex-1 min-h-0 overflow-y-auto) */}
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide py-1 pr-0.5">
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {filteredSlots.map(slot => {
                            const isSelected = selectedSlotId === slot.id;
                            const isSoldOut = slot.remainingQuantity <= 0;
                            const knowledge = getSkuKnowledge(slot.sku, slot.name);
                            const isAnimal = slot.kind === 'animal';

                            return (
                                <div
                                    key={slot.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedSlotId(slot.id)}
                                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedSlotId(slot.id)}
                                    className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border p-2.5 text-left transition-all duration-150 outline-none cursor-pointer ${
                                        isSelected
                                            ? 'border-orange-400 bg-orange-50/25 shadow-xs ring-2 ring-orange-500/20'
                                            : 'border-slate-200/90 bg-white hover:border-orange-200 hover:shadow-2xs hover:bg-slate-50/40'
                                    } ${isSoldOut ? 'opacity-70 bg-slate-50/80' : ''}`}
                                >
                                    {/* 顶部角标：货架号与品类 */}
                                    <div className="flex items-center justify-between gap-1 mb-1.5">
                                        <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-medium text-slate-500">
                                            #{Number(slot.id) + 1} 货位
                                        </span>
                                        <span className={`rounded border px-1 py-0.2 text-[9px] font-medium leading-none ${knowledge.badgeBg}`}>
                                            {knowledge.badgeText}
                                        </span>
                                    </div>

                                    {/* 居中商品展示舞台 (h-16 紧凑精良) */}
                                    <div className="relative my-0.5 flex h-16 w-full items-center justify-center rounded-lg border border-slate-100 bg-gradient-to-b from-slate-50/80 to-slate-100/30 transition-transform duration-150 group-hover:scale-[1.02]">
                                        <ItemIconImage
                                            src={farmItemIcon(slot.sku)}
                                            alt={slot.name}
                                            className="h-10 w-10 drop-shadow-2xs"
                                            fallback={
                                                isAnimal ? (
                                                    <Package className="h-8 w-8 text-orange-400" />
                                                ) : (
                                                    <Sprout className="h-8 w-8 text-emerald-500" />
                                                )
                                            }
                                        />

                                        {/* 拟物化售罄印章 */}
                                        {isSoldOut && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10 backdrop-blur-[0.5px]">
                                                <div className="transform -rotate-12 rounded border-2 border-red-500 bg-white/95 px-1.5 py-0.2 shadow-2xs">
                                                    <span className="text-[10px] font-extrabold tracking-wider text-red-600">
                                                        已售罄
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* 底部信息：名称、价格与库存进度 */}
                                    <div className="mt-1.5 space-y-1">
                                        <p className="truncate text-xs font-bold text-slate-800" title={slot.name}>
                                            {slot.name}
                                        </p>

                                        <div className="flex items-baseline justify-between">
                                            <div className="flex items-baseline gap-0.5">
                                                <span className="text-sm font-extrabold text-orange-600 tabular-nums">
                                                    {marketMoney(slot.price)}
                                                </span>
                                                <span className="text-[9px] text-orange-500/80">币/份</span>
                                            </div>

                                            <span
                                                className={`rounded px-1 py-0.2 text-[9px] font-medium tabular-nums ${
                                                    isSoldOut
                                                        ? 'bg-slate-100 text-slate-400'
                                                        : slot.remainingQuantity === 1
                                                          ? 'bg-amber-50 text-amber-700 font-bold border border-amber-200'
                                                          : 'bg-slate-100 text-slate-600'
                                                }`}
                                            >
                                                {isSoldOut ? '售罄' : `余 ${slot.remainingQuantity} 份`}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 3. 常驻农资专柜卡片 (shrink-0 固定吸附在底部，永远不被遮挡或滚出) */}
                <div className="shrink-0 pt-2">
                    <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedSlotId('feed')}
                        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedSlotId('feed')}
                        className={`group relative flex flex-wrap items-center justify-between gap-2.5 rounded-xl border px-3 py-2 transition-all duration-150 cursor-pointer outline-none ${
                            isSelectedFeed
                                ? 'border-amber-400 bg-amber-50/50 shadow-xs ring-2 ring-amber-500/20'
                                : 'border-amber-200/80 bg-gradient-to-r from-amber-50/40 via-white to-amber-50/20 hover:border-amber-300 hover:shadow-2xs'
                        }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-100/70 p-1 shadow-inner group-hover:scale-105 transition-transform">
                                <ItemIconImage
                                    src={farmItemIcon('feed')}
                                    alt="饲料"
                                    className="h-6 w-6"
                                    fallback={<Wheat className="h-5 w-5 text-amber-600" />}
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-800">🌾 农资常驻供销处 · 基础饲料</span>
                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 border border-amber-200">
                                        不限购 · 持续稳定供应
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-500 leading-tight">
                                    牲畜维持生命产出的刚需口粮，不占用上方随机轮换货架。
                                </p>
                            </div>
                        </div>

                        <div className="flex items-baseline gap-0.5 text-right sm:shrink-0">
                            <span className="text-sm font-extrabold text-amber-700 tabular-nums">
                                {marketMoney(shop.feed.price)}
                            </span>
                            <span className="text-[10px] text-amber-600/80 font-medium">世界币 / 份</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 右侧：黄金情报站与选品物语 */}
            <div className="h-full min-h-0 hidden lg:block overflow-hidden">
                <MarketDetailSidebar
                    type="shop-slot"
                    shopSlot={currentSelectedSlot}
                    isFeed={isSelectedFeed}
                    feedPrice={shop.feed.price}
                    recentTransactions={recentTransactions}
                />
            </div>
        </div>
    );
}
