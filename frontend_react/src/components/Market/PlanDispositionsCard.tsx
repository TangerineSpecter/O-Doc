import {PlanDispositionItem} from './PlanDispositionItem';
import {SlidersHorizontal} from 'lucide-react';
import type {MarketAutomationDisposition} from '../../types/api/market';

export function PlanDispositionsCard({
    dispositions,
    itemNames,
}: {
    dispositions: MarketAutomationDisposition[];
    itemNames: Record<string, string>;
}) {
    return (
        <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50/40 p-3.5 shadow-2xs">
            {/* 标题栏 */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <SlidersHorizontal className="h-4 w-4 text-orange-500" />
                    <span>产物处置与挂牌策略</span>
                    <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-700">
                        {dispositions.length} 种产物
                    </span>
                </div>

                {/* 顶部全局图例说明 */}
                <div className="flex items-center gap-2.5 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                        集市挂牌
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        商店直售
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                        背包留存
                    </span>
                </div>
            </div>

            {/* 处置策略列表 */}
            <div className="mt-2.5 flex-1 space-y-2 overflow-y-auto scrollbar-hide pr-0.5">
                {dispositions.length ? (
                    dispositions.map(row => <PlanDispositionItem key={row.sku} row={row} itemNames={itemNames} />)
                ) : (
                    <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/50 text-center">
                        <SlidersHorizontal className="h-6 w-6 text-slate-300" />
                        <p className="mt-2 text-xs font-medium text-slate-500">暂无产物处置策略</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">入库产物将默认进入待规划标记</p>
                    </div>
                )}
            </div>
        </div>
    );
}
