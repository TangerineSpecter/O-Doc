import {AlertTriangle, Sparkles, UserCheck, ShieldCheck} from 'lucide-react';
import type {MarketAutomationDisposition} from '../../types/api/market';
import {marketSkuName} from './marketPresentation';

type Props = {row: MarketAutomationDisposition; itemNames: Record<string, string>; variant?: 'compact' | 'full'};

export function PlanDispositionItem({row, itemNames, variant = 'compact'}: Props) {
    const displayName = marketSkuName(row.sku, itemNames);
    const isReview = row.status === 'review';
    const holdRatio = Math.max(0, 100 - row.sellRatio - row.listRatio);
    const priceRatioNum = Number(row.listPriceRatio || 1);
    const markupPercent = Math.round((priceRatioNum - 1) * 100);
    if (variant === 'full') return (
        <div

            className={`rounded-xl border p-3.5 sm:p-4 transition-all ${
                isReview
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-slate-200/80 bg-slate-50/40 hover:border-orange-200 hover:shadow-2xs'
            }`}
        >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="text-xs font-bold text-slate-800">
                        {displayName}
                    </span>
                    {row.source === 'model' ? (
                        <span className="inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.2 text-[9px] font-semibold text-purple-700">
                            <Sparkles className="h-2.5 w-2.5 text-purple-500" />
                            AI智囊
                        </span>
                    ) : row.source === 'manual' ? (
                        <span className="inline-flex items-center gap-0.5 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.2 text-[9px] font-semibold text-blue-700">
                            <UserCheck className="h-2.5 w-2.5 text-blue-500" />
                            手动
                        </span>
                    ) : null}
    
                    {/* 保底件数徽章 */}
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600 font-medium">
                        <ShieldCheck className="h-3 w-3 text-slate-400" />
                        <span>保底自留</span>
                        <strong className="text-slate-800 font-bold tabular-nums">{row.targetHold}</strong>
                        <span>件</span>
                    </span>
                </div>
    
                <div className="flex items-center gap-1 shrink-0 text-xs">
                    <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-medium ${
                            row.starOrder === 'high'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-600'
                        }`}
                    >
                        {row.starOrder === 'high' ? '⭐ 高星优先' : '低星优先'}
                    </span>
                    {markupPercent !== 0 && (
                        <span className="rounded bg-violet-100 border border-violet-200/80 px-1.5 py-0.2 text-[10px] font-bold text-violet-700">
                            {markupPercent > 0 ? `+${markupPercent}% 挂牌溢价` : `${markupPercent}% 挂牌`}
                        </span>
                    )}
                </div>
            </div>
    
            {/* 超出保底流向指标 */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                        <span className="h-2 w-2 rounded-full bg-violet-500 ring-2 ring-violet-100" />
                        集市挂牌 <strong className="tabular-nums">{row.listRatio}%</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                        商店直售 <strong className="tabular-nums">{row.sellRatio}%</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-slate-300 ring-2 ring-slate-100" />
                        背包留存 <strong className="tabular-nums">{holdRatio}%</strong>
                    </span>
                </div>
                <span className="text-[10px] text-slate-400">超出保底分配</span>
            </div>
    
            {/* 三色分段条 */}
            <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-slate-200/80 ring-1 ring-slate-200/60 p-0.5 gap-0.5">
                {row.listRatio > 0 && (
                    <div
                        title={`集市挂牌 ${row.listRatio}%`}
                        className="h-full rounded-l-full bg-violet-500 transition-all duration-300"
                        style={{width: `${row.listRatio}%`}}
                    />
                )}
                {row.sellRatio > 0 && (
                    <div
                        title={`商店直售 ${row.sellRatio}%`}
                        className={`h-full bg-emerald-500 transition-all duration-300 ${
                            row.listRatio === 0 ? 'rounded-l-full' : ''
                        } ${holdRatio === 0 ? 'rounded-r-full' : ''}`}
                        style={{width: `${row.sellRatio}%`}}
                    />
                )}
                {holdRatio > 0 && (
                    <div
                        title={`背包留存 ${holdRatio}%`}
                        className="h-full rounded-r-full bg-slate-300 transition-all duration-300"
                        style={{width: `${holdRatio}%`}}
                    />
                )}
            </div>
    
            {row.reason && (
                <div className="mt-2 flex items-center gap-1 rounded-md bg-amber-100/70 px-2 py-1 text-[11px] text-amber-800">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                    <span className="truncate">{row.reason}</span>
                </div>
            )}
        </div>
    );
    return (
        <div

            className={`rounded-xl border p-2.5 transition-all ${
                isReview
                    ? 'border-amber-300/80 bg-amber-50/40'
                    : 'border-slate-200/80 bg-white hover:border-orange-200 hover:shadow-2xs'
            }`}
        >
            {/* 顶部：名称 + 保底件数 + 标签群 */}
            <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span className="text-xs font-bold text-slate-800">
                        {displayName}
                    </span>
    
                    {/* 决策来源 */}
                    {row.source === 'model' ? (
                        <span className="inline-flex items-center gap-0.5 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.2 text-[9px] font-semibold text-purple-700 shrink-0">
                            <Sparkles className="h-2.5 w-2.5 text-purple-500" />
                            AI智囊
                        </span>
                    ) : row.source === 'manual' ? (
                        <span className="inline-flex items-center gap-0.5 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.2 text-[9px] font-semibold text-blue-700 shrink-0">
                            <UserCheck className="h-2.5 w-2.5 text-blue-500" />
                            手动
                        </span>
                    ) : null}
    
                    {/* 保底自用件数（独立徽章，不混淆比例） */}
                    <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium shrink-0">
                        <ShieldCheck className="h-3 w-3 text-slate-400" />
                        <span>保底自留</span>
                        <strong className="text-slate-800 font-bold tabular-nums">{row.targetHold}</strong>
                        <span>件</span>
                    </span>
                </div>
    
                {/* 星级偏好与溢价倍率 */}
                <div className="flex items-center gap-1 shrink-0 text-[10px]">
                    <span
                        className={`rounded px-1.5 py-0.2 font-medium ${
                            row.starOrder === 'high'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                        {row.starOrder === 'high' ? '⭐ 高星优先' : '低星优先'}
                    </span>
                    {markupPercent !== 0 && (
                        <span className="rounded bg-violet-100 border border-violet-200/80 px-1.5 py-0.2 font-bold text-violet-700">
                            {markupPercent > 0 ? `+${markupPercent}% 挂牌溢价` : `${markupPercent}% 挂牌`}
                        </span>
                    )}
                </div>
            </div>
    
            {/* 超额部分分配图例说明（颜色与下方进度条严格一一对应） */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                <div className="flex items-center gap-3 flex-wrap">
                    <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                        <span className="h-2 w-2 rounded-full bg-violet-500 ring-2 ring-violet-100 shrink-0" />
                        集市挂牌 <strong className="tabular-nums font-bold">{row.listRatio}%</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100 shrink-0" />
                        商店直售 <strong className="tabular-nums font-bold">{row.sellRatio}%</strong>
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                        <span className="h-2 w-2 rounded-full bg-slate-300 ring-2 ring-slate-100 shrink-0" />
                        背包留存 <strong className="tabular-nums font-medium">{holdRatio}%</strong>
                    </span>
                </div>
                <span className="text-[9px] text-slate-400">超出保底处置</span>
            </div>
    
            {/* 高对比度三色分段进度条 (紫色=挂牌, 绿色=直售, 浅灰=背包自用) */}
            <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/60 p-0.5 gap-0.5">
                {row.listRatio > 0 && (
                    <div
                        title={`集市挂牌 ${row.listRatio}%`}
                        className="h-full rounded-l-full bg-violet-500 transition-all duration-300"
                        style={{width: `${row.listRatio}%`}}
                    />
                )}
                {row.sellRatio > 0 && (
                    <div
                        title={`商店直售 ${row.sellRatio}%`}
                        className={`h-full bg-emerald-500 transition-all duration-300 ${
                            row.listRatio === 0 ? 'rounded-l-full' : ''
                        } ${holdRatio === 0 ? 'rounded-r-full' : ''}`}
                        style={{width: `${row.sellRatio}%`}}
                    />
                )}
                {holdRatio > 0 && (
                    <div
                        title={`背包留存 ${holdRatio}%`}
                        className="h-full rounded-r-full bg-slate-300 transition-all duration-300"
                        style={{width: `${holdRatio}%`}}
                    />
                )}
            </div>
    
            {/* 待复核或异常原因 */}
            {row.reason && (
                <div className="mt-2 flex items-center gap-1 rounded-md bg-amber-100/70 px-2 py-1 text-[10px] text-amber-800">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
                    <span className="truncate">{row.reason}</span>
                </div>
            )}
        </div>
    );
}
