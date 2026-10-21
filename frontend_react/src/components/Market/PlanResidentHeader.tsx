import {Sparkles, Wallet, Flame, PiggyBank, Maximize2} from 'lucide-react';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import type {MarketAutomationPlan} from '../../types/api/market';
import {marketMoney} from './marketPresentation';

const statusConfig: Record<string, {label: string; badgeClass: string; dotClass: string}> = {
    active: {
        label: '执行中',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        dotClass: 'bg-emerald-500 animate-pulse',
    },
    failed: {
        label: '规划失败',
        badgeClass: 'bg-red-50 text-red-700 border-red-200/80',
        dotClass: 'bg-red-500',
    },
    closed: {
        label: '已结束',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
    },
    open: {
        label: '待执行',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/80',
        dotClass: 'bg-amber-500',
    },
};

export function PlanResidentHeader({
    actorName,
    actorAvatar,
    plan,
    onMaximize,
}: {
    actorName: string;
    actorAvatar?: string;
    plan: MarketAutomationPlan;
    onMaximize?: () => void;
}) {
    const budget = Number(plan.budget || 0);
    const spent = Number(plan.spent || 0);
    const remaining = Math.max(0, budget - spent);
    const ratio = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    const currentStatus = statusConfig[plan.status] || {
        label: '状态未知',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
        dotClass: 'bg-slate-400',
    };

    return (
        <div className="space-y-3">
            {/* 居民基本信息与财务指标 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* 左侧：居民身份 */}
                <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                        <AgentAvatar name={actorName} avatar={actorAvatar} size="md" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-800">{actorName}</h3>
                            <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${currentStatus.badgeClass}`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${currentStatus.dotClass}`} />
                                {currentStatus.label}
                            </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                            每日自动化交易 · 智能预算控制与挂单管理
                        </p>
                    </div>
                </div>

                {/* 右侧：预算指标胶囊 */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-slate-600">
                        <Wallet className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-[11px] text-slate-400">总预算</span>
                        <span className="font-bold tabular-nums text-slate-700">{marketMoney(plan.budget)} G</span>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-xl border border-orange-200/80 bg-orange-50/60 px-2.5 py-1.5 text-orange-700">
                        <Flame className="h-3.5 w-3.5 text-orange-500" />
                        <span className="text-[11px] text-orange-600/80">已支出</span>
                        <span className="font-bold tabular-nums text-orange-700">{marketMoney(plan.spent)} G</span>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-2.5 py-1.5 text-emerald-700">
                        <PiggyBank className="h-3.5 w-3.5 text-emerald-600" />
                        <span className="text-[11px] text-emerald-600/80">结余</span>
                        <span className="font-bold tabular-nums text-emerald-700">
                            {marketMoney(String(remaining))} G
                        </span>
                    </div>

                    {onMaximize && (
                        <button
                            type="button"
                            onClick={onMaximize}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/60 shadow-2xs transition-all active:scale-95 shrink-0"
                            title={`全屏展开查看${actorName}的完整经营规划`}
                        >
                            <Maximize2 className="h-3.5 w-3.5 text-orange-500" />
                            <span className="hidden sm:inline">全屏查看</span>
                        </button>
                    )}
                </div>
            </div>

            {/* 预算消耗进度条 */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-2.5">
                <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1.5">
                    <span className="flex items-center gap-1 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                        今日预算使用进度
                    </span>
                    <span className="tabular-nums font-semibold text-slate-600">
                        {ratio}% <span className="font-normal text-slate-400">({marketMoney(plan.spent)} / {marketMoney(plan.budget)} G)</span>
                    </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200/70">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-orange-400 via-amber-400 to-emerald-400 transition-all duration-500"
                        style={{width: `${ratio}%`}}
                    />
                </div>
            </div>

            {/* 经营方针便签 */}
            {plan.summary && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-amber-50/20 px-3 py-2 text-xs text-amber-900/90 shadow-2xs">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                        <span className="font-bold mr-1 text-amber-800">今日经营方针:</span>
                        <span className="leading-relaxed">{plan.summary}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
