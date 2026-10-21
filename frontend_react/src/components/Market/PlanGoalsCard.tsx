import {PlanGoalItem} from './PlanGoalItem';
import {Target, Sparkles} from 'lucide-react';
import type {MarketAutomationGoal} from '../../types/api/market';

export function PlanGoalsCard({
    goals,
    itemNames,
}: {
    goals: MarketAutomationGoal[];
    itemNames: Record<string, string>;
}) {
    const totalFilled = goals.reduce((acc, g) => acc + (g.filledQuantity || 0), 0);
    const totalQuantity = goals.reduce((acc, g) => acc + (g.quantity || 0), 0);
    const completedGoalsCount = goals.filter(g => g.quantity > 0 && g.filledQuantity >= g.quantity).length;

    return (
        <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-slate-50/40 p-3.5 shadow-2xs">
            {/* 标题栏 */}
            <div className="flex shrink-0 items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Target className="h-4 w-4 text-orange-500" />
                    <span>今日采购目标</span>
                    <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-700">
                        {goals.length} 项
                    </span>
                </div>
                {goals.length > 0 && (
                    <span className="text-[11px] font-medium text-slate-500 tabular-nums">
                        已完成 {completedGoalsCount}/{goals.length} 项 · 数量 {totalFilled}/{totalQuantity}
                    </span>
                )}
            </div>

            {/* 目标列表 */}
            <div className="mt-2.5 flex-1 space-y-2 overflow-y-auto scrollbar-hide pr-0.5">
                {goals.length ? (
                    goals.map(goal => <PlanGoalItem key={goal.id} goal={goal} itemNames={itemNames} />)
                ) : (
                    <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/50 text-center">
                        <Sparkles className="h-6 w-6 text-slate-300" />
                        <p className="mt-2 text-xs font-medium text-slate-500">今日暂无指定采购目标</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">以处理库存与自主观望为主</p>
                    </div>
                )}
            </div>
        </div>
    );
}
