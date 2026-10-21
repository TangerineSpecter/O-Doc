import {PlanGoalItem} from './PlanGoalItem';
import {PlanDispositionItem} from './PlanDispositionItem';
import {PlanTickRow} from './PlanTickRow';
import {Target, SlidersHorizontal, ShieldAlert, Clock, Minimize2} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import type {MarketAutomationPlan} from '../../types/api/market';
import {marketMoney} from './marketPresentation';
import {PlanResidentHeader} from './PlanResidentHeader';

export function MarketPlanFullscreenModal({
    plan,
    actorName,
    actorAvatar,
    itemNames,
    onClose,
}: {
    plan: MarketAutomationPlan;
    actorName: string;
    actorAvatar?: string;
    itemNames: Record<string, string>;
    onClose: () => void;
}) {
    const goals = plan.goals || [];
    const dispositions = plan.dispositions || [];
    const noBuy = plan.noBuy || [];
    const ticks = plan.ticks || [];

    const totalFilled = goals.reduce((acc, g) => acc + (g.filledQuantity || 0), 0);
    const totalQuantity = goals.reduce((acc, g) => acc + (g.quantity || 0), 0);
    const completedGoalsCount = goals.filter(g => g.quantity > 0 && g.filledQuantity >= g.quantity).length;

    return (
        <WorldDialog
            title={`${actorName} · 市场自动化经营全景看板`}
            description="今日预算调配、采购计划、产物处置与风控时序全景明细"
            onClose={onClose}
            size="extra-wide"
            titleAction={
                <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600 transition-all active:scale-95 shadow-2xs"
                    title="退出全屏看板"
                >
                    <Minimize2 className="h-3.5 w-3.5 text-orange-500" />
                    <span>退出全屏</span>
                </button>
            }
        >
            {/* 全景主滚动容器：自然纵向平滑滚动，无任何内部截断或小滚动框嵌套 */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-6 p-1 sm:p-2 pb-6">
                {/* 1. 经营概览与财务罗盘 */}
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs">
                    <PlanResidentHeader actorName={actorName} actorAvatar={actorAvatar} plan={plan} />
                </div>

                {/* 2. 今日采购计划全景 (全展开多列网格) */}
                <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                <Target className="h-4 w-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-800">今日采购计划清单</h4>
                                <p className="text-[11px] text-slate-400">
                                    自主评估播种缺口与装备替换需求
                                </p>
                            </div>
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700 ml-1">
                                {goals.length} 项目标
                            </span>
                        </div>

                        {goals.length > 0 && (
                            <span className="text-xs font-medium text-slate-500 tabular-nums">
                                已完成 <strong className="text-emerald-600 font-bold">{completedGoalsCount}</strong> / {goals.length} 项 · 采购量 {totalFilled} / {totalQuantity}
                            </span>
                        )}
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {goals.length ? (
                            goals.map(goal => <PlanGoalItem key={goal.id} goal={goal} itemNames={itemNames} variant="full" />)
                        ) : (
                            <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                                今日暂无指定采购目标
                            </div>
                        )}
                    </div>
                </section>

                {/* 3. 产物处置与挂牌策略全景 (全展开多列网格) */}
                <section className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                <SlidersHorizontal className="h-4 w-4" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-slate-800">产物处置与挂牌策略</h4>
                                <p className="text-[11px] text-slate-400">
                                    自留保底与超出部分的集市挂牌、商店快速变现配比
                                </p>
                            </div>
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700 ml-1">
                                {dispositions.length} 种产物
                            </span>
                        </div>

                        {/* 全局图例说明 */}
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1 font-medium text-violet-700">
                                <span className="h-2 w-2 rounded-full bg-violet-500 ring-2 ring-violet-100" />
                                集市挂牌 (溢价)
                            </span>
                            <span className="flex items-center gap-1 font-medium text-emerald-700">
                                <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
                                商店直售 (变现)
                            </span>
                            <span className="flex items-center gap-1 font-medium text-slate-500">
                                <span className="h-2 w-2 rounded-full bg-slate-300 ring-2 ring-slate-100" />
                                背包留存
                            </span>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {dispositions.length ? (
                            dispositions.map(row => <PlanDispositionItem key={row.sku} row={row} itemNames={itemNames} variant="full" />)
                        ) : (
                            <div className="col-span-full py-8 text-center text-slate-400 text-xs">
                                暂无产物处置策略
                            </div>
                        )}
                    </div>
                </section>

                {/* 4. 决策风控与巡检时间轴全景 (全量平铺) */}
                <div className="grid gap-5 lg:grid-cols-2">
                    {/* 左：装备风控 */}
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                    <ShieldAlert className="h-4 w-4" />
                                </div>
                                <h4 className="text-sm font-bold text-slate-800">装备风控与不买清单</h4>
                                <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-600">
                                    {noBuy.length} 件
                                </span>
                            </div>
                            <span className="text-xs text-slate-400">属性无提升或超预算</span>
                        </div>

                        <div className="mt-3.5 space-y-2">
                            {noBuy.length ? (
                                noBuy.map((row, index) => (
                                    <div
                                        key={row.equipmentId || index}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-slate-50/50 px-3.5 py-2.5 text-xs"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-100 shrink-0">
                                                不购买
                                            </span>
                                            <span className="font-medium text-slate-700 truncate">
                                                {row.reason || '比较后判定不买'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0 text-xs text-slate-400 tabular-nums">
                                            {Number(row.price) > 0 && (
                                                <span className="font-bold text-slate-700">
                                                    {marketMoney(row.price)} G
                                                </span>
                                            )}
                                            {row.decidedAt && (
                                                <span>
                                                    {new Date(row.decidedAt).toLocaleTimeString('zh-CN', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="py-6 text-center text-xs text-slate-400">
                                    暂无拉黑装备，遇到候选装备将结合战力提升实时评估
                                </p>
                            )}
                        </div>
                    </div>

                    {/* 右：巡检时序 */}
                    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-2xs">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                    <Clock className="h-4 w-4" />
                                </div>
                                <h4 className="text-sm font-bold text-slate-800">小时巡检执行时序</h4>
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                                    {ticks.length} 轮
                                </span>
                            </div>
                            <span className="text-xs text-slate-400">整点自动扫描货架</span>
                        </div>

                        <div className="mt-3.5 space-y-2">
                            {ticks.length ? (
                                ticks.map((tick, index) => <PlanTickRow key={tick.scheduledAt || index} tick={tick} isLatest={index === ticks.length - 1} variant="full" />)
                            ) : (
                                <p className="py-6 text-center text-xs text-slate-400">
                                    尚未生成整点巡检记录
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </WorldDialog>
    );
}
