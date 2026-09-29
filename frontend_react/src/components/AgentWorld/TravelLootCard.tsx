import {Gift, Package, Sparkles, Coins} from 'lucide-react';
import type {TravelJourney} from '../../types/api/travel';

interface TravelLootCardProps {
    debugPurchase?: TravelJourney['snapshot']['debugPurchase'];
    shopping?: TravelJourney['snapshot']['shopping'];
    goods?: TravelJourney['snapshot']['goods'];
}

export default function TravelLootCard({debugPurchase, shopping, goods}: TravelLootCardProps) {
    const hasDebugItems = debugPurchase && debugPurchase.items && debugPurchase.items.length > 0;
    const hasShoppingBasket = shopping && shopping.basket && shopping.basket.length > 0;

    if (!hasDebugItems && !hasShoppingBasket) return null;

    return (
        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-500/5 via-orange-500/5 to-white p-4 shadow-xs sm:p-5">
            {/* 标题栏 */}
            <div className="flex items-center justify-between pb-3 border-b border-amber-100/70">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <Gift className="h-4 w-4" />
                    </span>
                    <h4 className="text-xs font-bold text-slate-800">旅途收获与战利品</h4>
                </div>
                {hasDebugItems && (
                    <span className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200/50">
                        本地补录道具
                    </span>
                )}
            </div>

            {/* 本地调试补录提示说明 */}
            {hasDebugItems && (
                <p className="mt-2.5 text-[11px] text-amber-700/90 leading-tight">
                    未扣除余额，作为本地测试道具补录计入。
                </p>
            )}

            {/* 调试道具列表 */}
            {hasDebugItems && (
                <div className="mt-3 space-y-2">
                    {debugPurchase.items.map((item, idx) => {
                        const isRare = item.name.includes('稀有') || item.name.includes('专属') || item.name.includes('主线');
                        return (
                            <div
                                key={item.id || idx}
                                className="flex items-center justify-between gap-2 rounded-xl border border-amber-100/80 bg-white/90 p-2.5 shadow-2xs transition-colors hover:border-amber-300"
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                        isRare ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                    }`}>
                                        {isRare ? <Sparkles className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-bold text-slate-800">
                                            {item.name}
                                        </p>
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                            <Coins className="h-3 w-3 text-amber-500" />
                                            <span>价值 {item.value} 世界币</span>
                                        </div>
                                    </div>
                                </div>

                                <span className="rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-bold text-orange-700 shrink-0">
                                    × {item.quantity}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 购买的纪念品列表 */}
            {hasShoppingBasket && (
                <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-2">
                    <p className="text-[11px] font-semibold text-slate-600 mb-1">
                        当地挑选纪念品：
                    </p>
                    {shopping.basket.map(item => {
                        const good = goods?.find(g => g.id === item.id);
                        const cost = Number(good?.price || 0) * item.quantity;
                        return (
                            <div
                                key={item.id}
                                className="flex items-center justify-between rounded-lg bg-slate-50/70 px-2.5 py-1.5 text-xs text-slate-700 border border-slate-100"
                            >
                                <div className="flex items-center gap-1.5 truncate">
                                    <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                    <span className="truncate font-medium">{good?.name || '旅行纪念品'}</span>
                                    <span className="text-slate-400 text-[11px]">× {item.quantity}</span>
                                </div>
                                <span className="text-amber-700 font-semibold shrink-0 text-[11px]">
                                    {cost} 世界币
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
