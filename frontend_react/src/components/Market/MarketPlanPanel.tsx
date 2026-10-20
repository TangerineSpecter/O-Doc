import {Ban, Clock3, SlidersHorizontal, Target} from 'lucide-react';
import type {ReactNode} from 'react';
import type {MarketAutomationPlan} from '../../types/api/market';
import {marketMoney} from './marketPresentation';

const kindLabel: Record<string, string> = {shop: '商店', listing: '居民挂牌', equipment: '装备'};
const statusLabel: Record<string, string> = {
    active: '执行中',
    failed: '规划失败',
    closed: '已结束',
    open: '待完成',
    filled: '已完成',
    cancelled: '已取消',
    expired: '已过期',
};

function Pill({children, tone = 'slate'}: {children: ReactNode; tone?: 'slate' | 'orange' | 'emerald' | 'red'}) {
    const classes = {
        slate: 'bg-slate-100 text-slate-600',
        orange: 'bg-orange-100 text-orange-700',
        emerald: 'bg-emerald-100 text-emerald-700',
        red: 'bg-red-100 text-red-700',
    }[tone];
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${classes}`}>{children}</span>;
}

function PlanCard({plan}: {plan: MarketAutomationPlan}) {
    const budget = Number(plan.budget || 0);
    const spent = Number(plan.spent || 0);
    const ratio = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">{plan.actorName || plan.actorId}</span>
                    <Pill tone={plan.status === 'active' ? 'emerald' : plan.status === 'failed' ? 'red' : 'slate'}>
                        {statusLabel[plan.status] || plan.status}
                    </Pill>
                </div>
                <div className="text-xs text-slate-500 tabular-nums">
                    预算 {marketMoney(plan.budget)} · 已花 {marketMoney(plan.spent)} · 剩余{' '}
                    {marketMoney(String(Math.max(0, budget - spent)))}
                </div>
            </header>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400" style={{width: `${ratio}%`}} />
            </div>
            {plan.summary && <p className="mt-2 text-xs leading-relaxed text-slate-500">{plan.summary}</p>}

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Target className="h-3.5 w-3.5 text-orange-500" />
                        今日采购目标
                    </div>
                    {plan.goals.length ? (
                        <ul className="mt-2 space-y-1.5">
                            {plan.goals.map(goal => (
                                <li key={goal.id} className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-600">
                                    <span className="min-w-0 truncate">
                                        <span className="mr-1 rounded bg-white px-1 py-0.5 font-semibold text-slate-500 ring-1 ring-slate-200">
                                            {kindLabel[goal.kind] || goal.kind}
                                        </span>
                                        {goal.sku || goal.slot}
                                        {goal.minStars > 1 ? ` · ${goal.minStars}星以上` : ''}
                                    </span>
                                    <span className="tabular-nums text-slate-500">
                                        {goal.filledQuantity}/{goal.quantity} · 上限 {marketMoney(goal.maxUnitPrice)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-[11px] text-slate-400">今天没有采购目标，只执行处置。</p>
                    )}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-orange-500" />
                        处置策略
                    </div>
                    {plan.dispositions.length ? (
                        <ul className="mt-2 max-h-32 space-y-1.5 overflow-y-auto scrollbar-hide">
                            {plan.dispositions.map(row => (
                                <li key={row.sku} className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-600">
                                    <span className="min-w-0 truncate">{row.sku}</span>
                                    <span className="tabular-nums text-slate-500">
                                        留 {row.targetHold} · 卖 {row.sellRatio}% · 挂 {row.listRatio}% ·{' '}
                                        {row.starOrder === 'high' ? '高星优先' : '低星优先'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-[11px] text-slate-400">还没有处置策略，入库物品会进入待标记队列。</p>
                    )}
                </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Ban className="h-3.5 w-3.5 text-slate-400" />
                        永久不买（{plan.noBuy.length}）
                    </div>
                    {plan.noBuy.length ? (
                        <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto scrollbar-hide">
                            {plan.noBuy.map(row => (
                                <li key={row.equipmentId} className="truncate text-[11px] text-slate-500">
                                    {row.equipmentId} · {row.reason || '比较后判定不买'}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-[11px] text-slate-400">没有拉黑的装备，遇到候选会逐件判断。</p>
                    )}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Clock3 className="h-3.5 w-3.5 text-orange-500" />
                        小时预检
                    </div>
                    {plan.ticks.length ? (
                        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto scrollbar-hide">
                            {plan.ticks.map(tick => (
                                <li key={tick.scheduledAt} className="text-[11px] text-slate-500">
                                    <span className="tabular-nums">{new Date(tick.scheduledAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}</span>
                                    {' · '}
                                    <span className={tick.status === 'done' ? 'text-emerald-600' : tick.status === 'failed' ? 'text-red-600' : ''}>
                                        {tick.status}
                                    </span>
                                    {tick.reason ? ` · ${tick.reason}` : ''}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-2 text-[11px] text-slate-400">本小时还没有预检记录。</p>
                    )}
                </div>
            </div>
        </section>
    );
}

export function MarketPlanPanel({plans}: {plans: MarketAutomationPlan[]}) {
    if (!plans.length) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <Target className="h-10 w-10 text-orange-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">今天还没有市场规划</p>
                <p className="mt-1 text-xs text-slate-400">每日规划生成后，这里会显示预算、采购目标与小时执行原因。</p>
            </div>
        );
    }
    return (
        <div className="flex-1 space-y-3 overflow-y-auto scrollbar-hide pb-1">
            {plans.map(plan => <PlanCard key={plan.id} plan={plan} />)}
        </div>
    );
}
