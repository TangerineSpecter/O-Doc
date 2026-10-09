import {hasItemStars} from '../../utils/itemQuality';
import {Clock, Coins, Sparkles, Building2, TrendingUp, Info, User, ArrowRight, ShieldCheck, Flame} from 'lucide-react';
import type {MarketSlot, MarketListing, MarketTransaction, MarketSupply} from '../../types/api/market';
import {ItemIconImage} from '../AgentWorld/ItemIconImage';
import {farmItemIcon} from '../Farm/assets';
import {getSkuKnowledge, getSupplyKnowledge} from './marketMetadata';
import {marketMoney, marketTime, marketOperationLabels} from './marketPresentation';

export interface MarketSidebarProps {
    type: 'shop-slot' | 'listing' | 'empty';
    shopSlot?: MarketSlot | null;
    supply?: MarketSupply | null;
    isFeed?: boolean;
    feedPrice?: string;
    listing?: MarketListing | null;
    recentTransactions?: MarketTransaction[];
}

export function MarketDetailSidebar({
    type,
    shopSlot,
    supply,
    isFeed,
    feedPrice,
    listing,
    recentTransactions = [],
}: MarketSidebarProps) {
    // 常驻农资与随机商品共用详情卡，内容来自各自的经营档案。
    if (type === 'shop-slot' || isFeed) {
        const sku = supply?.sku || (isFeed ? 'feed' : shopSlot?.sku || 'seed.radish');
        const name = sku === 'feed' ? '常驻饲料' : supply?.name || shopSlot?.name || '未知商品';
        const price = supply?.price || (isFeed ? feedPrice || '5' : shopSlot?.price || '0');
        const knowledge = supply ? getSupplyKnowledge(supply) : getSkuKnowledge(sku, name);
        const iconSrc = farmItemIcon(sku);

        return (
            <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-hide text-xs">
                {/* 头部大卡片：物品立体展台 */}
                <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-orange-50/40 via-white to-white p-4 shadow-xs">
                    <div className="absolute right-0 top-0 -mr-6 -mt-6 h-24 w-24 rounded-full bg-orange-400/10 blur-xl pointer-events-none" />
                    
                    <div className="flex items-start gap-3.5">
                        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-200/80 bg-white p-2 shadow-xs ring-4 ring-orange-100/50">
                            <ItemIconImage
                                src={iconSrc}
                                alt={name}
                                className="h-10 w-10 transition-transform duration-200 hover:scale-110"
                                fallback={<Sparkles className="h-8 w-8 text-orange-400" />}
                            />
                            {(supply || isFeed) && (
                                <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                    常驻
                                </span>
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${knowledge.badgeBg}`}>
                                    {knowledge.badgeText}
                                </span>
                                <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                                    {knowledge.categoryLabel}
                                </span>
                            </div>
                            <h3 className="mt-1.5 text-sm font-bold text-slate-900 truncate">{name}</h3>
                            <div className="mt-1 flex items-baseline gap-1">
                                <span className="text-base font-extrabold text-orange-600 tabular-nums">
                                    {marketMoney(price)}
                                </span>
                                <span className="text-[11px] text-orange-500/80 font-medium">世界币 / 份</span>
                            </div>
                        </div>
                    </div>

                    <p className="mt-3.5 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-600">
                        {knowledge.summary}
                    </p>
                </div>

                {/* 农牧生产/运营百科档案卡 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs pb-2.5 border-b border-slate-100">
                        <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                        <span>生态经营档案</span>
                    </div>

                    <div className="mt-3 space-y-2.5">
                        {knowledge.operatingFacts?.map(fact => {
                            const Icon = {dose: Coins, timing: Clock, effect: Sparkles, rule: ShieldCheck, quote: Clock}[fact.kind];
                            return <div key={fact.kind} className="flex items-start justify-between gap-3">
                                <span className="flex shrink-0 items-center gap-1 text-slate-500"><Icon className="h-3 w-3 text-slate-400"/>{fact.label}</span>
                                <span className={`text-right font-semibold ${fact.kind === 'effect' ? 'text-emerald-600' : 'text-slate-700'}`}>{fact.value}</span>
                            </div>;
                        })}
                        {knowledge.growthTimeText && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Clock className="h-3 w-3 text-slate-400" />
                                    生长时间
                                </span>
                                <span className="font-semibold text-slate-700">{knowledge.growthTimeText}</span>
                            </div>
                        )}

                        {knowledge.periodText && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Clock className="h-3 w-3 text-slate-400" />
                                    产出周期
                                </span>
                                <span className="font-semibold text-slate-700">{knowledge.periodText}</span>
                            </div>
                        )}

                        {knowledge.building && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Building2 className="h-3 w-3 text-slate-400" />
                                    所需建筑
                                </span>
                                <span className="font-semibold text-slate-700">{knowledge.building}</span>
                            </div>
                        )}

                        {knowledge.productName && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Sparkles className="h-3 w-3 text-slate-400" />
                                    收获产物
                                </span>
                                <span className="font-semibold text-slate-700">{knowledge.productName}</span>
                            </div>
                        )}

                        {knowledge.productEstimatedYield && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1 text-slate-500">
                                    <Coins className="h-3 w-3 text-slate-400" />
                                    预估产量
                                </span>
                                <span className="font-semibold text-emerald-600">{knowledge.productEstimatedYield}</span>
                            </div>
                        )}

                        {knowledge.estimatedRevenue && (
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">回收基准收益</span>
                                <span className="font-bold text-orange-600">{knowledge.estimatedRevenue}</span>
                            </div>
                        )}

                        {knowledge.profitRate && (
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500">预期利润比</span>
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    {knowledge.profitRate}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="mt-3.5 rounded-xl bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500 border border-slate-100">
                        <span className="font-semibold text-slate-700">💡 农务建议：</span>
                        {knowledge.tips}
                    </div>
                </div>

                {/* 集市实时快讯 */}
                {recentTransactions.length > 0 && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                            <span className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                                <Flame className="h-3.5 w-3.5 text-orange-500" />
                                集市实时动态
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                交易中
                            </span>
                        </div>
                        <div className="mt-3 space-y-2">
                            {recentTransactions.slice(0, 3).map(tx => (
                                <div key={tx.id} className="rounded-xl bg-slate-50/80 p-2 text-[11px] border border-slate-100">
                                    <div className="flex items-center justify-between font-medium text-slate-700">
                                        <span className="truncate max-w-[120px] font-semibold">{tx.actorName}</span>
                                        <span className="text-orange-600 font-bold">{tx.result.total ? `${marketMoney(tx.result.total)} 币` : ''}</span>
                                    </div>
                                    <p className="mt-0.5 text-slate-400 text-[10px]">
                                        {marketOperationLabels[tx.operation.kind] || tx.operation.kind} · {tx.result.name || '商品'} · {marketTime(tx.createdAt)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // 2. 如果是居民集市的挂牌详情
    if (type === 'listing' && listing) {
        const item = listing.item;
        const iconSrc = item.iconAssetId ? `/api/resource/view/${item.iconAssetId}` : farmItemIcon(item.source?.sku || '');
        const isGold = item.source?.quality === 'gold';
        const isSouvenir = item.kind === 'souvenir';

        return (
            <div className="flex h-full flex-col gap-4 overflow-y-auto scrollbar-hide text-xs">
                {/* 挂牌商品卡 */}
                <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-orange-50/30 to-white p-4 shadow-xs">
                    <div className="flex items-start gap-3.5">
                        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-orange-200/80 bg-white p-2 shadow-xs">
                            <ItemIconImage
                                src={iconSrc}
                                alt={item.name}
                                className="h-10 w-10"
                                fallback={<Sparkles className="h-8 w-8 text-orange-400" />}
                            />
                            {isGold && (
                                <span className="absolute -bottom-1 -right-1 rounded-full bg-amber-500 px-1 py-0.2 text-[9px] font-bold text-white shadow-xs">
                                    金色
                                </span>
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                                    isGold ? 'bg-amber-50 border-amber-200 text-amber-700' : isSouvenir ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                    {hasItemStars(item.source?.sku) ? `★${item.source?.stars || 1} ${item.source?.sku?.startsWith('dish.') ? '美食' : '农作物'}` : isGold ? '金色品质' : isSouvenir ? '旅行纪念品' : '标准农产品'}
                                </span>
                            </div>
                            <h3 className="mt-1.5 text-sm font-bold text-slate-900 truncate">{item.name}</h3>
                            <div className="mt-1 flex items-baseline gap-1">
                                <span className="text-base font-extrabold text-orange-600 tabular-nums">
                                    {marketMoney(listing.unitPrice)}
                                </span>
                                <span className="text-[11px] text-orange-500/80 font-medium">世界币 / 份</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-3.5 border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                            <User className="h-3 w-3 text-slate-400" />
                            摊主：<strong className="text-slate-700">{listing.sellerName}</strong>
                        </span>
                        <span>剩余 <strong className="text-slate-800 font-bold">{listing.remainingQuantity}</strong> 份</span>
                    </div>
                </div>

                {/* 卖家挂牌故事与改价历史 */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                        <span className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                            <ShieldCheck className="h-3.5 w-3.5 text-orange-500" />
                            摊位信息
                        </span>
                        <span className="text-[11px] text-slate-400">{marketTime(listing.createdAt)} 上架</span>
                    </div>

                    <div className="mt-3 space-y-2 text-[11px]">
                        <div className="flex justify-between text-slate-500">
                            <span>初始挂牌数量</span>
                            <span className="font-semibold text-slate-700">{listing.initialQuantity} 份</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                            <span>商品原产地 / 来源</span>
                            <span className="font-semibold text-slate-700">{item.originActorName ? `${item.originActorName} 的背包` : '自产自销'}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                            <span>{hasItemStars(item.source?.sku) ? '首批回收单价' : '商品原始估值'}</span>
                            <span className="font-semibold text-slate-700">{marketMoney(item.value || '0')} 世界币</span>
                        </div>
                    </div>

                    {listing.history && listing.history.length > 0 && (
                        <div className="mt-4 border-t border-slate-100 pt-3">
                            <div className="flex items-center gap-1 font-semibold text-slate-700 text-[11px] mb-2">
                                <span>改价动态（共 {listing.history.length} 次）</span>
                            </div>
                            <div className="space-y-1.5">
                                {listing.history.map((record, idx) => (
                                    <div key={idx} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
                                        <span className="text-slate-400">{marketTime(record.at)}</span>
                                        <div className="flex items-center gap-1 font-medium">
                                            <span className="line-through text-slate-400">{record.from}</span>
                                            <ArrowRight className="h-2.5 w-2.5 text-slate-400" />
                                            <span className="text-orange-600 font-bold">{record.to} 币</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-3.5 text-[11px] text-slate-600 leading-relaxed">
                    <p className="font-semibold text-orange-800 flex items-center gap-1">
                        <Info className="h-3.5 w-3.5 text-orange-600 shrink-0" />
                        居民集市规则
                    </p>
                    <p className="mt-1 text-slate-500">
                        居民在配置「市场交易」任务后，会根据背包存量与行情策略自行在此挂牌或采购其他居民的上架物品。
                    </p>
                </div>
            </div>
        );
    }

    // 默认空状态
    return (
        <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-6 text-center text-slate-400">
            <Sparkles className="h-8 w-8 text-orange-300" />
            <p className="mt-2 text-xs font-medium text-slate-500">点击左侧商品卡片</p>
            <p className="mt-1 text-[11px] text-slate-400">可查看百科档案、收益率与经营指南</p>
        </div>
    );
}
