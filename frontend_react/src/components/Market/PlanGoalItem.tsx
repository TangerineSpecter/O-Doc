import {CheckCircle2, Clock, Clock3} from 'lucide-react';
import type {MarketAutomationGoal} from '../../types/api/market';
import {marketEquipmentSlotLabels, marketMoney, marketSkuName} from './marketPresentation';

const kindBadges: Record<string, {label: string; className: string}> = {
    shop: {
        label: '🏪 商店采购',
        className: 'bg-sky-50 text-sky-700 border-sky-200/80',
    },
    listing: {
        label: '🏷️ 居民集市',
        className: 'bg-violet-50 text-violet-700 border-violet-200/80',
    },
    equipment: {
        label: '⚔️ 装备换新',
        className: 'bg-amber-50 text-amber-700 border-amber-200/80',
    },
};

type Props = {goal: MarketAutomationGoal; itemNames: Record<string, string>; variant?: 'compact' | 'full'};

export function PlanGoalItem({goal, itemNames, variant = 'compact'}: Props) {
    const isDone = goal.quantity > 0 && goal.filledQuantity >= goal.quantity;
    const progress = goal.quantity > 0
        ? Math.min(100, Math.round((goal.filledQuantity / goal.quantity) * 100))
        : 0;
    const badge = kindBadges[goal.kind] || {
        label: '📦 采购',
        className: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    const displayName =
        goal.kind === 'equipment'
            ? marketEquipmentSlotLabels[goal.slot] || '指定装备部位'
            : marketSkuName(goal.sku || goal.slot, itemNames);
    if (variant === 'full') return (
        <div

            className={`rounded-xl border p-3.5 transition-all ${
                isDone
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : 'border-slate-200/80 bg-slate-50/40 hover:border-orange-200 hover:shadow-2xs'
            }`}
        >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span
                        className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${badge.className}`}
                    >
                        {badge.label}
                    </span>
                    <span className="font-bold text-xs text-slate-800">
                        {displayName}
                    </span>
                    {goal.minStars > 1 && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-1 py-0.2 text-[10px] font-bold text-amber-700">
                            ⭐ {goal.minStars}星+
                        </span>
                    )}
                </div>
    
                {isDone ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        已买齐
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        <Clock3 className="h-3 w-3 text-slate-400" />
                        进行中
                    </span>
                )}
            </div>
    
            {goal.reason && (
                <p className="mt-1.5 text-xs text-slate-500 flex items-center gap-1">
                    <span className="text-orange-400">↳</span>
                    <span>{goal.reason}</span>
                </p>
            )}
    
            <div className="mt-3 flex items-center justify-between gap-4 text-xs">
                <div className="flex-1">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[11px]">采购完成度</span>
                        <span className="font-semibold tabular-nums text-slate-700">
                            {goal.filledQuantity} / {goal.quantity} 件 ({progress}%)
                        </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${
                                isDone
                                    ? 'bg-emerald-500'
                                    : 'bg-gradient-to-r from-orange-400 to-amber-400'
                            }`}
                            style={{width: `${progress}%`}}
                        />
                    </div>
                </div>
    
                <div className="shrink-0 text-right">
                    <span className="text-[11px] text-slate-400 block">最高单价上限</span>
                    <span className="font-bold tabular-nums text-slate-800 text-xs">
                        ≤ {marketMoney(goal.maxUnitPrice)} G
                    </span>
                </div>
            </div>
        </div>
    );
    return (
        <div

            className={`rounded-xl border p-2.5 transition-all ${
                isDone
                    ? 'border-emerald-200/90 bg-emerald-50/30'
                    : 'border-slate-200/80 bg-white hover:border-orange-200 hover:shadow-2xs'
            }`}
        >
            {/* 顶部：渠道标签 + 物品名 + 星级 + 状态 */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5 flex-wrap">
                    <span
                        className={`rounded-md border px-1.5 py-0.2 text-[10px] font-bold shrink-0 ${badge.className}`}
                    >
                        {badge.label}
                    </span>
                    <span className="font-bold text-xs text-slate-800 truncate">
                        {displayName}
                    </span>
                    {goal.minStars > 1 && (
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-1 py-0.2 text-[10px] font-bold text-amber-700">
                            ⭐ {goal.minStars}星+
                        </span>
                    )}
                </div>
    
                {/* 完成状态胶囊 */}
                <div className="shrink-0">
                    {isDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.2 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            已买齐
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-medium text-slate-600">
                            <Clock className="h-3 w-3 text-slate-400" />
                            进行中
                        </span>
                    )}
                </div>
            </div>
    
            {/* 采购原因动机提示 */}
            {goal.reason && (
                <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                    <span className="text-orange-400">↳</span>
                    <span className="truncate">{goal.reason}</span>
                </p>
            )}
    
            {/* 底部进度与限价 */}
            <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-slate-500 mb-1">
                        <span className="text-[10px]">采购进度</span>
                        <span className="font-semibold tabular-nums text-slate-700">
                            {goal.filledQuantity} / {goal.quantity} 件 ({progress}%)
                        </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${
                                isDone
                                    ? 'bg-emerald-500'
                                    : 'bg-gradient-to-r from-orange-400 to-amber-400'
                            }`}
                            style={{width: `${progress}%`}}
                        />
                    </div>
                </div>
    
                <div className="shrink-0 text-right">
                    <span className="text-[10px] text-slate-400 block">单价上限</span>
                    <span className="font-bold tabular-nums text-slate-700">
                        ≤ {marketMoney(goal.maxUnitPrice)} G
                    </span>
                </div>
            </div>
        </div>
    );
}
