import {farmItemIcon} from '../Farm/assets';
import {Coins, Compass, History, Package, Sparkles, User, X} from 'lucide-react';
import type {InventoryItem} from '../../types/api/travel';
import {inventoryRarities} from './inventoryRarities';
import {ItemIconImage} from './ItemIconImage';

export function TravelSouvenirDetails({item, onClose}: {item: InventoryItem; onClose: () => void}) {
    const isFarm = Boolean(farmItemIcon(item.source.sku || ''));
    const rarity = inventoryRarities[item.rarity] || inventoryRarities.common;
    const value = item.value ?? item.source.unitPrice;
    const number = value ? Number(value) : NaN;
    const displayValue = Number.isFinite(number) ? number.toLocaleString('zh-CN', {maximumFractionDigits: 2}) : '—';
    const destination = [item.source.destination?.country, item.source.destination?.city].filter(Boolean).join(' · ') || (isFarm ? '世界物品' : '未明旅途');

    return (
        <section
            aria-label="物品详情"
            aria-live="polite"
            className="max-h-[85vh] w-full min-w-0 overflow-y-auto rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xl space-y-4"
        >
            {/* 顶部标签栏与关闭按钮 */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                        <Compass className="h-3 w-3 text-slate-400" />
                        {isFarm ? '经营物品' : '旅行纪念珍藏'}
                    </span>
                    <span
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-2xs"
                        style={{
                            backgroundColor: rarity.badgeBg || '#f8fafc',
                            color: rarity.color,
                            border: `1px solid ${rarity.color}33`,
                        }}
                    >
                        <Sparkles className="h-3 w-3 fill-current" />
                        {rarity.label}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="关闭详情"
                    title="关闭"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            {/* 物品展示主角区 */}
            <div className="flex items-center gap-3.5">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 shadow-xs">
                    <ItemIconImage
                        src={item.iconUrl || farmItemIcon(item.source.sku || '')}
                        alt={item.name}
                        className="h-full w-full object-cover rounded-2xl"
                        fallback={<Package className="h-8 w-8 text-slate-300" />}
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-slate-900 leading-snug line-clamp-2" title={item.name}>
                        {item.name}
                    </h3>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        <Compass className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{destination}</span>
                    </p>
                </div>
            </div>

            {/* 公会参考估价券 */}
            <div className="flex items-center justify-between rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-amber-50/40 to-white p-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
                        <Coins className="h-4 w-4" />
                    </div>
                    <div>
                        <div className="text-[11px] font-semibold text-amber-900">公会参考估价</div>
                        <div className="text-[9px] font-mono text-amber-600/80">VALUATION</div>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-lg font-extrabold text-amber-950">{displayValue}</span>
                    <span className="ml-1 text-xs font-semibold text-amber-700">世界币</span>
                </div>
            </div>

            {/* 描述与见闻 */}
            {item.source.description && (
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-600">
                    {item.source.description}
                </div>
            )}

            {/* 属性档案网格 */}
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <Package className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <div className="text-[10px] text-slate-400">持有数量</div>
                        <div className="font-semibold text-slate-800">{item.quantity} 件</div>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <Coins className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <div className="text-[10px] text-slate-400">{isFarm ? '参考单价' : '购入单价'}</div>
                        <div className="truncate font-semibold text-slate-800">
                            {isFarm ? `${displayValue} 世界币` : item.source.unitPrice ? `${item.source.unitPrice} 世界币` : '—'}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <History className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <div className="text-[10px] text-slate-400">原始获得者</div>
                        <div className="truncate font-semibold text-slate-800" title={item.originActorName || item.originActorId}>
                            {item.originActorName || item.originActorId || '旅行获得'}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <User className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                        <div className="text-[10px] text-slate-400">当前归属</div>
                        <div className="truncate font-semibold text-slate-800" title={item.actorName || item.actorId}>
                            {item.actorName || item.actorId || '未知'}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

