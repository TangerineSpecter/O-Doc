import {PlanTickRow} from './PlanTickRow';
import {ShieldAlert, ShieldCheck, Clock} from 'lucide-react';
import type {MarketAutomationNoBuy, MarketAutomationTick} from '../../types/api/market';
import {marketMoney} from './marketPresentation';

export function PlanAuditCard({
    noBuy,
    ticks,
}: {
    noBuy: MarketAutomationNoBuy[];
    ticks: MarketAutomationTick[];
}) {
    return (
        <div className="grid gap-3.5 lg:grid-cols-2">
            {/* 左栏：🛡️ 装备风控与不买清单 */}
            <div className="flex h-[190px] flex-col rounded-2xl border border-slate-200 bg-slate-50/40 p-3 shadow-2xs">
                {/* 标题栏 */}
                <div className="flex shrink-0 items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <ShieldAlert className="h-4 w-4 text-slate-500" />
                        <span>装备风控与不买清单</span>
                        <span className="rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] font-bold text-slate-600">
                            {noBuy.length}
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-400">过滤属性无提升或超预算装备</span>
                </div>

                {/* 列表区：内部独立平滑滚动，高度与右侧严格对齐 */}
                <div className="mt-2 flex-1 min-h-0 space-y-1.5 overflow-y-auto scrollbar-hide pr-0.5">
                    {noBuy.length ? (
                        noBuy.map((row, index) => (
                            <div
                                key={row.equipmentId || index}
                                className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5 text-[11px] hover:border-slate-300 hover:shadow-2xs transition-colors"
                            >
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="rounded bg-rose-50 px-1.5 py-0.2 text-[10px] font-semibold text-rose-700 border border-rose-100 shrink-0">
                                        不购买
                                    </span>
                                    <span className="font-medium text-slate-700 truncate">
                                        {row.reason || '比较后判定不买'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 text-[10px] text-slate-400 tabular-nums">
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
                        <div className="flex h-full flex-col items-center justify-center text-center">
                            <ShieldCheck className="h-5 w-5 text-slate-300" />
                            <p className="mt-1 text-xs font-medium text-slate-500">暂无拉黑装备</p>
                            <p className="text-[10px] text-slate-400">
                                遇到候选装备将结合战力提升实时评估
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* 右栏：⏱️ 小时巡检时序 */}
            <div className="flex h-[190px] flex-col rounded-2xl border border-slate-200 bg-slate-50/40 p-3 shadow-2xs">
                {/* 标题栏 */}
                <div className="flex shrink-0 items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Clock className="h-4 w-4 text-orange-500" />
                        <span>小时巡检时序</span>
                        <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-700">
                            {ticks.length} 轮
                        </span>
                    </div>
                    <span className="text-[10px] text-slate-400">整点扫描货架与自动巡查</span>
                </div>

                {/* 列表区：内部独立平滑滚动，高度与左侧严格对齐 */}
                <div className="mt-2 flex-1 min-h-0 space-y-1.5 overflow-y-auto scrollbar-hide pr-0.5">
                    {ticks.length ? (
                        ticks.map((tick, index) => <PlanTickRow key={tick.scheduledAt || index} tick={tick} isLatest={index === ticks.length - 1} />)
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center text-center">
                            <Clock className="h-5 w-5 text-slate-300" />
                            <p className="mt-1 text-xs font-medium text-slate-500">尚未生成整点巡检记录</p>
                            <p className="text-[10px] text-slate-400">
                                到达整点或触发策略时自动记录时序
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
