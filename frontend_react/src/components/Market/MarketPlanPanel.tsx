import {useState, useMemo} from 'react';
import {Target, Users, Sparkles} from 'lucide-react';
import type {MarketAutomationPlan} from '../../types/api/market';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import {PlanResidentHeader} from './PlanResidentHeader';
import {PlanGoalsCard} from './PlanGoalsCard';
import {PlanDispositionsCard} from './PlanDispositionsCard';
import {PlanAuditCard} from './PlanAuditCard';
import {MarketPlanFullscreenModal} from './MarketPlanFullscreenModal';

function PlanCard({
    plan,
    actorName,
    actorAvatar,
    itemNames,
    onMaximize,
}: {
    plan: MarketAutomationPlan;
    actorName: string;
    actorAvatar?: string;
    itemNames: Record<string, string>;
    onMaximize: () => void;
}) {
    return (
        <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs hover:border-orange-200/80 hover:shadow-sm transition-all space-y-3.5">
            {/* 居民信息与财务看板 */}
            <PlanResidentHeader
                actorName={actorName}
                actorAvatar={actorAvatar}
                plan={plan}
                onMaximize={onMaximize}
            />

            {/* 核心双栏：今日采购目标 vs 产物处置策略 */}
            <div className="grid gap-3.5 lg:grid-cols-2">
                <div className="h-[280px]">
                    <PlanGoalsCard goals={plan.goals || []} itemNames={itemNames} />
                </div>
                <div className="h-[280px]">
                    <PlanDispositionsCard dispositions={plan.dispositions || []} itemNames={itemNames} />
                </div>
            </div>

            {/* 决策风控与整点巡检 */}
            <PlanAuditCard noBuy={plan.noBuy || []} ticks={plan.ticks || []} />
        </section>
    );
}

export function MarketPlanPanel({
    plans,
    residents = [],
    itemNames = {},
}: {
    plans: MarketAutomationPlan[];
    residents?: Array<{id: string; name: string; avatar?: string}>;
    itemNames?: Record<string, string>;
}) {
    // 支持按居民快捷聚焦过滤
    const [selectedActorId, setSelectedActorId] = useState<string>('all');
    // 全屏查看详情弹窗状态
    const [fullscreenPlan, setFullscreenPlan] = useState<{
        plan: MarketAutomationPlan;
        actorName: string;
        actorAvatar?: string;
    } | null>(null);

    // 建立居民映射快速查找
    const residentMap = useMemo(() => {
        const map = new Map<string, {name: string; avatar?: string}>();
        for (const r of residents) {
            if (r.id) map.set(r.id, r);
            if (r.name) map.set(r.name, r);
        }
        return map;
    }, [residents]);

    if (!plans.length) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <Target className="h-10 w-10 text-orange-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">今天还没有市场规划</p>
                <p className="mt-1 text-xs text-slate-400">
                    每日晨间规划生成后，这里将呈现各居民的预算调配、采购目标与产物挂牌策略。
                </p>
            </div>
        );
    }

    // 过滤出当前展示的计划
    const filteredPlans =
        selectedActorId === 'all'
            ? plans
            : plans.filter(p => p.actorId === selectedActorId);

    // 如果选中的居民在当前 plans 中找不到，则回退到 'all'
    const displayPlans = filteredPlans.length ? filteredPlans : plans;

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden gap-2.5">
            {/* 多居民快捷切换胶囊条 (当居民数 > 1 时显示) */}
            {plans.length > 1 && (
                <div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto scrollbar-hide rounded-xl bg-slate-100/80 p-1">
                    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                        <button
                            type="button"
                            onClick={() => setSelectedActorId('all')}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                selectedActorId === 'all'
                                    ? 'bg-white text-orange-600 shadow-2xs'
                                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                            }`}
                        >
                            <Users className="h-3.5 w-3.5" />
                            <span>全部居民概览</span>
                            <span
                                className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                                    selectedActorId === 'all'
                                        ? 'bg-orange-100 text-orange-700'
                                        : 'bg-slate-200 text-slate-500'
                                }`}
                            >
                                {plans.length}
                            </span>
                        </button>

                        {plans.map(plan => {
                            const res = residentMap.get(plan.actorId) || residentMap.get(plan.actorName);
                            const name = res?.name || (plan.actorName && plan.actorName !== plan.actorId ? plan.actorName : '居民');
                            const isSelected = selectedActorId === plan.actorId;
                            const budget = Number(plan.budget || 0);
                            const spent = Number(plan.spent || 0);
                            const ratio = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

                            return (
                                <button
                                    key={plan.id}
                                    type="button"
                                    onClick={() => setSelectedActorId(plan.actorId)}
                                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                                        isSelected
                                            ? 'bg-white text-orange-600 shadow-2xs border border-orange-200/50'
                                            : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                                    }`}
                                >
                                    <AgentAvatar name={name} avatar={res?.avatar} size="xs" />
                                    <span>{name}</span>
                                    <span
                                        className={`rounded px-1 text-[9px] font-bold tabular-nums ${
                                            isSelected
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-slate-200 text-slate-500'
                                        }`}
                                    >
                                        {ratio}%
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 shrink-0 pr-1">
                        <Sparkles className="h-3 w-3 text-orange-400" />
                        <span>点击居民可快速聚焦专属决策</span>
                    </div>
                </div>
            )}

            {/* 卡片主滚动区 */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-3.5 pr-0.5">
                {displayPlans.map(plan => {
                    const res = residentMap.get(plan.actorId) || residentMap.get(plan.actorName);
                    const actorName = res?.name || (plan.actorName && plan.actorName !== plan.actorId ? plan.actorName : '未知居民');
                    return (
                        <PlanCard
                            key={plan.id}
                            plan={plan}
                            actorName={actorName}
                            actorAvatar={res?.avatar}
                            itemNames={itemNames}
                            onMaximize={() => setFullscreenPlan({plan, actorName, actorAvatar: res?.avatar})}
                        />
                    );
                })}
            </div>

            {/* 全屏全景查看弹窗 */}
            {fullscreenPlan && (
                <MarketPlanFullscreenModal
                    plan={fullscreenPlan.plan}
                    actorName={fullscreenPlan.actorName}
                    actorAvatar={fullscreenPlan.actorAvatar}
                    itemNames={itemNames}
                    onClose={() => setFullscreenPlan(null)}
                />
            )}
        </div>
    );
}
