import {useState, useMemo} from 'react';
import {
    Coins,
    Tag,
    User,
    Footprints,
    ArrowUpRight,
    ArrowDownLeft,
    TrendingUp,
    ChevronDown,
    ChevronUp,
    AlertCircle,
    Store,
} from 'lucide-react';
import type {MarketSession, MarketTransaction} from '../../types/api/market';
import {marketMoney, marketOperationLabels, marketTime} from './marketPresentation';

export function MarketTransactions({items}: {items: MarketTransaction[]}) {
    // 统计数据
    const stats = useMemo(() => {
        let totalVolume = 0;
        const actorCounts: Record<string, number> = {};
        for (const tx of items) {
            if (tx.result.total) {
                totalVolume += Number(tx.result.total) || 0;
            }
            actorCounts[tx.actorName] = (actorCounts[tx.actorName] || 0) + 1;
        }
        const topActors = Object.entries(actorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        return {totalVolume, count: items.length, topActors};
    }, [items]);

    if (!items.length) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <Coins className="h-10 w-10 text-orange-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">暂无交易流水记录</p>
                <p className="mt-1 text-xs text-slate-400">居民在系统商店或集市中发生成交后，将在此生成世界流水凭据</p>
            </div>
        );
    }

    return (
        <div className="grid h-full min-h-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* 左侧：交易流水卡片流 */}
            <div className="flex h-full flex-col min-h-0 overflow-y-auto pr-1 scrollbar-hide space-y-2.5">
                {items.map(row => {
                    const isBuy = row.operation.kind.includes('buy');
                    const isSell = row.operation.kind.includes('sell');

                    return (
                        <article
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs hover:border-orange-200 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-center gap-3">
                                {/* 状态图标 */}
                                <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                        isBuy
                                            ? 'border-orange-200 bg-orange-50 text-orange-600'
                                            : isSell
                                              ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                              : 'border-blue-200 bg-blue-50 text-blue-600'
                                    }`}
                                >
                                    {isBuy ? (
                                        <ArrowDownLeft className="h-5 w-5" />
                                    ) : isSell ? (
                                        <ArrowUpRight className="h-5 w-5" />
                                    ) : (
                                        <Tag className="h-5 w-5" />
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-800">{row.actorName}</span>
                                        <span
                                            className={`rounded-md px-1.5 py-0.2 text-[10px] font-semibold ${
                                                isBuy
                                                    ? 'bg-orange-100 text-orange-700'
                                                    : isSell
                                                      ? 'bg-emerald-100 text-emerald-700'
                                                      : 'bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            {marketOperationLabels[row.operation.kind] || row.operation.kind}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-600">
                                        {row.result.name || '挂牌物品'}
                                        {row.result.quantity ? (
                                            <span className="font-semibold text-slate-800"> × {row.result.quantity}</span>
                                        ) : (
                                            ''
                                        )}
                                        <span className="mx-1 text-slate-300">·</span>
                                        <span className="text-[11px] text-slate-400">{marketTime(row.createdAt)}</span>
                                    </p>
                                </div>
                            </div>

                            {/* 成交金额 */}
                            {row.result.total && (
                                <div className="text-right">
                                    <span
                                        className={`text-sm font-extrabold tabular-nums ${
                                            isSell ? 'text-emerald-600' : 'text-orange-600'
                                        }`}
                                    >
                                        {isSell ? '+' : '-'}
                                        {marketMoney(row.result.total)}
                                    </span>
                                    <p className="text-[10px] text-slate-400">世界币</p>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            {/* 右侧：集市流水概览看板 */}
            <div className="h-full min-h-0 hidden lg:flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs pb-2.5 border-b border-slate-100">
                        <TrendingUp className="h-3.5 w-3.5 text-orange-500" />
                        <span>集市流水大盘</span>
                    </div>

                    <div className="mt-3.5 space-y-3">
                        <div className="rounded-xl bg-orange-50/50 p-3 border border-orange-100">
                            <span className="text-[11px] text-orange-700/80 font-medium">当前列表流通总额</span>
                            <div className="mt-1 flex items-baseline gap-1">
                                <span className="text-lg font-extrabold text-orange-600 tabular-nums">
                                    {marketMoney(String(stats.totalVolume))}
                                </span>
                                <span className="text-xs text-orange-600/80 font-medium">世界币</span>
                            </div>
                        </div>

                        <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                            <span>记录总笔数</span>
                            <span className="font-bold text-slate-700 tabular-nums">{stats.count} 笔</span>
                        </div>

                        {stats.topActors.length > 0 && (
                            <div className="border-t border-slate-100 pt-3">
                                <span className="text-[11px] font-semibold text-slate-600 block mb-2">活跃交易居民</span>
                                <div className="space-y-1.5">
                                    {stats.topActors.map(([name, count], i) => (
                                        <div key={name} className="flex items-center justify-between text-xs text-slate-600">
                                            <div className="flex items-center gap-1.5">
                                                <span
                                                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                                                        i === 0
                                                            ? 'bg-amber-100 text-amber-700'
                                                            : 'bg-slate-100 text-slate-500'
                                                    }`}
                                                >
                                                    {i + 1}
                                                </span>
                                                <span className="font-medium text-slate-700">{name}</span>
                                            </div>
                                            <span className="text-[11px] text-slate-400 tabular-nums">{count} 笔交易</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 text-[11px] text-slate-500 leading-relaxed">
                    <p className="font-semibold text-slate-700 flex items-center gap-1">
                        <Store className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        资金结算规则
                    </p>
                    <p className="mt-1 text-slate-400">
                        所有市场采购均从居民个人世界币账户即时扣除；居民挂牌售出的收入在成交瞬间自动存入其个人账户，无需手续费。
                    </p>
                </div>
            </div>
        </div>
    );
}

export function MarketSessions({items}: {items: MarketSession[]}) {
    const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => ({...prev, [id]: !prev[id]}));
    };

    if (!items.length) {
        return (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                <Footprints className="h-10 w-10 text-orange-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">暂无居民逛街动态</p>
                <p className="mt-1 text-xs text-slate-400">当居民体力充沛并在任务中包含市场交易时，会定期结伴来到集市采风选购</p>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col min-h-0 overflow-y-auto pr-1 scrollbar-hide space-y-3">
            {items.map(row => {
                const isActive = row.status === 'active';
                const isExpanded = expandedIds[row.id] ?? true; // 默认展开最新动态

                return (
                    <article
                        key={row.id}
                        className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs hover:border-orange-200 transition-all"
                    >
                        {/* 动态头部 */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-600 font-bold text-xs">
                                    <User className="h-4 w-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-slate-800">{row.actorName}</span>
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.2 text-[10px] font-semibold ${
                                                isActive
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : 'bg-slate-100 text-slate-500'
                                            }`}
                                        >
                                            {isActive && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                            {isActive ? '正在逛市场…' : '已结束市场活动'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                        {marketTime(row.createdAt)} 进入集市 · {row.reason || '自主经营采办'}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600 tabular-nums">
                                    {row.callCount} / 20 次交互操作
                                </span>
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(row.id)}
                                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                    aria-label="展开操作详情"
                                >
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        {/* 漫步决策时间轴 */}
                        {isExpanded && row.calls.length > 0 && (
                            <div className="mt-3.5 space-y-2 border-l-2 border-orange-100 pl-4 ml-2">
                                {row.calls.map((call, index) => {
                                    const hasError = Boolean(call.result?.error);

                                    return (
                                        <div key={index} className="relative text-xs">
                                            {/* 时间轴小圆点 */}
                                            <div
                                                className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-white ${
                                                    hasError ? 'bg-red-400' : 'bg-orange-400'
                                                }`}
                                            />

                                            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                                                <span className="font-semibold text-slate-700">
                                                    {marketOperationLabels[call.name] || call.name}
                                                </span>
                                                <span className="text-slate-400 tabular-nums">{marketTime(call.at)}</span>
                                            </div>

                                            {hasError ? (
                                                <p className="mt-1 rounded-lg bg-red-50 p-2 text-[11px] text-red-600 flex items-center gap-1">
                                                    <AlertCircle className="h-3 w-3 shrink-0" />
                                                    {call.result?.error}
                                                </p>
                                            ) : call.name === 'adjust_life_budget' ? (
                                                <div className="mt-1 rounded-lg bg-orange-50 px-2 py-1 text-[11px] text-slate-600">
                                                    <p>预算 {call.result?.budgetBefore} → {call.result?.budgetAfter} 币</p>
                                                    <p className="mt-1">{call.result?.reason}</p>
                                                </div>
                                            ) : call.result?.name ? (
                                                <div className="mt-1 flex items-center justify-between rounded-lg bg-slate-50/80 px-2 py-1 text-[11px] text-slate-600">
                                                    <span>
                                                        挑选了{' '}
                                                        <strong className="text-slate-800">{call.result.name}</strong>
                                                        {call.result.quantity ? ` × ${call.result.quantity}` : ''}
                                                    </span>
                                                    {call.result.total && (
                                                        <span className="font-bold text-orange-600 tabular-nums">
                                                            {marketMoney(call.result.total)} 币
                                                        </span>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </article>
                );
            })}
        </div>
    );
}
