import type {MarketAutomationTick} from '../../types/api/market';
import {marketTickStatusLabels} from './marketPresentation';

type Props = {tick: MarketAutomationTick; isLatest: boolean; variant?: 'compact' | 'full'};

export function PlanTickRow({tick, isLatest, variant = 'compact'}: Props) {
    const isDone = tick.status === 'done';
    const isFailed = tick.status === 'failed';
    const isSkipped = tick.status === 'skipped';
    if (variant === 'full') return (
        <div

            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors ${
                isLatest
                    ? 'border-orange-200 bg-orange-50/50 shadow-2xs'
                    : 'border-slate-200/70 bg-slate-50/50'
            }`}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        isDone
                            ? 'bg-emerald-500'
                            : isFailed
                              ? 'bg-red-500'
                              : isSkipped
                                ? 'bg-amber-400'
                                : 'bg-slate-300'
                    }`}
                />
                <span className="tabular-nums font-bold text-slate-700">
                    {new Date(tick.scheduledAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
                <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : isFailed
                              ? 'bg-red-100 text-red-700'
                              : isSkipped
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                    }`}
                >
                    {marketTickStatusLabels[tick.status] || tick.status}
                </span>
                {tick.reason && (
                    <span className="truncate text-slate-500 text-xs">
                        · {tick.reason}
                    </span>
                )}
            </div>
    
            {isLatest && (
                <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white shrink-0">
                    最新巡检
                </span>
            )}
        </div>
    );
    return (
        <div

            className={`flex flex-wrap items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                isLatest
                    ? 'border-orange-200/90 bg-orange-50/50 shadow-2xs'
                    : 'border-slate-200/70 bg-white hover:border-slate-300'
            }`}
        >
            <div className="flex items-center gap-2 min-w-0">
                <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                        isDone
                            ? 'bg-emerald-500'
                            : isFailed
                              ? 'bg-red-500'
                              : isSkipped
                                ? 'bg-amber-400'
                                : 'bg-slate-300'
                    }`}
                />
                <span className="tabular-nums font-bold text-slate-700">
                    {new Date(tick.scheduledAt).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
                <span
                    className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                        isDone
                            ? 'bg-emerald-100 text-emerald-700'
                            : isFailed
                              ? 'bg-red-100 text-red-700'
                              : isSkipped
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                    }`}
                >
                    {marketTickStatusLabels[tick.status] || tick.status}
                </span>
                {tick.reason && (
                    <span className="truncate text-slate-500 text-[10px]">
                        · {tick.reason}
                    </span>
                )}
            </div>
    
            {isLatest && (
                <span className="rounded-full bg-orange-500 px-1.5 py-0.2 text-[9px] font-bold text-white shrink-0">
                    最新
                </span>
            )}
        </div>
    );
}
