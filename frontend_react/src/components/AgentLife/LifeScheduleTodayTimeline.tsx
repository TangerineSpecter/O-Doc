import {useEffect, useMemo, useState, type ElementType} from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Calendar,
    Check,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Clock3,
    Coffee,
    Compass,
    MessageSquare,
    Moon,
    PlayCircle,
    Send,
    ShoppingBag,
    Sparkles,
    Sprout,
    Sun,
    Sunrise,
    Sunset,
    TrendingUp,
    Utensils,
} from 'lucide-react';
import type {LifeItem} from '../../types/api/agentLife';
import type {AgentConfig} from '../../types/api/setting';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import {activityLabels, showsLifeBudget, statusLabels} from './lifeLabels';

interface LifeScheduleTodayTimelineProps {
    loading: boolean;
    error: boolean;
    items: LifeItem[];
    agents: AgentConfig[];
    total: number;
    page: number;
    onPageChange: (page: number) => void;
    onSelectItem: (id: string) => void;
}

// 活动视觉映射
const activityMetaConfig: Record<
    string,
    {
        label: string;
        icon: ElementType;
        badgeColor: string;
        accentBar: string;
        dotColor: string;
    }
> = {
    travel: {
        label: '旅行',
        icon: Compass,
        badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
        accentBar: 'bg-cyan-500',
        dotColor: 'bg-cyan-500',
    },
    farm: {
        label: '农场经营',
        icon: Sprout,
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
        accentBar: 'bg-emerald-500',
        dotColor: 'bg-emerald-500',
    },
    post_interaction: {
        label: '阅读与评论',
        icon: MessageSquare,
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/80',
        accentBar: 'bg-blue-500',
        dotColor: 'bg-blue-500',
    },
    post_publish: {
        label: '自主发帖',
        icon: Send,
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
        accentBar: 'bg-indigo-500',
        dotColor: 'bg-indigo-500',
    },
    market: {
        label: '市场交易',
        icon: ShoppingBag,
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200/80',
        accentBar: 'bg-amber-500',
        dotColor: 'bg-amber-500',
    },
    market_prepare: {
        label: '每日市场机会',
        icon: ShoppingBag,
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200/80',
        accentBar: 'bg-amber-500',
        dotColor: 'bg-amber-500',
    },
    investment: {
        label: '股票投资',
        icon: TrendingUp,
        badgeColor: 'bg-lime-50 text-lime-700 border-lime-200/80',
        accentBar: 'bg-lime-600',
        dotColor: 'bg-lime-500',
    },
    cooking: {
        label: '美食制作',
        icon: Utensils,
        badgeColor: 'bg-orange-50 text-orange-700 border-orange-200/80',
        accentBar: 'bg-orange-500',
        dotColor: 'bg-orange-500',
    },
    exploration: {
        label: '迷宫探索',
        icon: Sparkles,
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200/80',
        accentBar: 'bg-purple-500',
        dotColor: 'bg-purple-500',
    },
    rest: {
        label: '休息',
        icon: Coffee,
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200/80',
        accentBar: 'bg-rose-400',
        dotColor: 'bg-rose-400',
    },
    unplanned: {
        label: '待规划',
        icon: Calendar,
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
        accentBar: 'bg-slate-400',
        dotColor: 'bg-slate-400',
    },
};

const getActivityMeta = (activity: string) => {
    return (
        activityMetaConfig[activity] || {
            label: activityLabels[activity] || activity,
            icon: Activity,
            badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
            accentBar: 'bg-slate-400',
            dotColor: 'bg-slate-400',
        }
    );
};

// 状态视觉映射
const statusMetaConfig: Record<
    string,
    {
        label: string;
        badgeColor: string;
        nodeBorder: string;
        nodeBg: string;
        nodeText: string;
        icon: ElementType;
        pulse?: boolean;
    }
> = {
    pending: {
        label: '待执行',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200/90',
        nodeBorder: 'border-amber-400',
        nodeBg: 'bg-amber-50',
        nodeText: 'text-amber-600',
        icon: Clock,
    },
    running: {
        label: '执行中',
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/90',
        nodeBorder: 'border-blue-500 ring-4 ring-blue-100',
        nodeBg: 'bg-blue-500',
        nodeText: 'text-white',
        icon: PlayCircle,
        pulse: true,
    },
    completed: {
        label: '已完成',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200/90',
        nodeBorder: 'border-emerald-500',
        nodeBg: 'bg-emerald-50',
        nodeText: 'text-emerald-600',
        icon: Check,
    },
    failed: {
        label: '失败',
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-200/90',
        nodeBorder: 'border-rose-400',
        nodeBg: 'bg-rose-50',
        nodeText: 'text-rose-600',
        icon: AlertTriangle,
    },
    deferred: {
        label: '已顺延',
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200/90',
        nodeBorder: 'border-purple-400',
        nodeBg: 'bg-purple-50',
        nodeText: 'text-purple-600',
        icon: ArrowRight,
    },
    rest: {
        label: '休息',
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
        nodeBorder: 'border-slate-300',
        nodeBg: 'bg-slate-100',
        nodeText: 'text-slate-500',
        icon: Coffee,
    },
    paused: {
        label: '暂停',
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
        nodeBorder: 'border-slate-300',
        nodeBg: 'bg-slate-100',
        nodeText: 'text-slate-500',
        icon: Clock,
    },
    cancelled: {
        label: '已取消',
        badgeColor: 'bg-slate-100 text-slate-500 border-slate-200 line-through',
        nodeBorder: 'border-slate-200',
        nodeBg: 'bg-slate-100',
        nodeText: 'text-slate-400',
        icon: Clock,
    },
};

const parseShanghaiMinutes = (dateStr: string) => {
    const d = new Date(dateStr);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(d);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
};

const formatShanghaiTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
};

const getShanghaiCurrent = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
        minutes: h * 60 + m,
        timeString: `${pad(h)}:${pad(m)}`,
        hoursRemaining: Math.max(0, 24 - h),
    };
};

// 4大自然时段
interface DayPeriodMeta {
    id: 'early' | 'morning' | 'afternoon' | 'night';
    name: string;
    range: string;
    minMinutes: number;
    maxMinutes: number;
    icon: ElementType;
}

const dayPeriods: DayPeriodMeta[] = [
    {
        id: 'early',
        name: '凌晨清晨',
        range: '00:00 - 08:59',
        minMinutes: 0,
        maxMinutes: 9 * 60,
        icon: Sunrise,
    },
    {
        id: 'morning',
        name: '上午时光',
        range: '09:00 - 11:59',
        minMinutes: 9 * 60,
        maxMinutes: 12 * 60,
        icon: Sun,
    },
    {
        id: 'afternoon',
        name: '午后傍晚',
        range: '12:00 - 17:59',
        minMinutes: 12 * 60,
        maxMinutes: 18 * 60,
        icon: Sunset,
    },
    {
        id: 'night',
        name: '晚间夜幕',
        range: '18:00 - 23:59',
        minMinutes: 18 * 60,
        maxMinutes: 24 * 60,
        icon: Moon,
    },
];

const getPeriodByMinutes = (minutes: number) => {
    for (const p of dayPeriods) {
        if (minutes >= p.minMinutes && minutes < p.maxMinutes) {
            return p;
        }
    }
    return dayPeriods[0];
};

export default function LifeScheduleTodayTimeline({
    loading,
    error,
    items,
    agents,
    total,
    page,
    onPageChange,
    onSelectItem,
}: LifeScheduleTodayTimelineProps) {
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [currentTime, setCurrentTime] = useState(getShanghaiCurrent);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(getShanghaiCurrent());
        }, 30000);
        return () => clearInterval(timer);
    }, []);

    const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

    // 升序排列
    const sortedItems = useMemo(() => {
        return items.slice().sort((a, b) => {
            return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
        });
    }, [items]);

    // 统计指标（实时反映当天开销与达成率）
    const stats = useMemo(() => {
        const totalCount = sortedItems.length;
        const completedCount = sortedItems.filter((i) => i.status === 'completed').length;
        const runningCount = sortedItems.filter((i) => i.status === 'running').length;
        const pendingCount = sortedItems.filter((i) => i.status === 'pending').length;
        const failedCount = sortedItems.filter((i) => i.status === 'failed').length;
        const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        // 统计总花费
        const totalSpent = sortedItems.reduce(
            (acc, i) => acc + (parseFloat(i.spent || '0') || 0),
            0
        );

        // 当天全部活动类型构成分布
        const activityCounts: Record<string, number> = {};
        for (const item of sortedItems) {
            activityCounts[item.activity] = (activityCounts[item.activity] || 0) + 1;
        }

        return {
            totalCount,
            completedCount,
            runningCount,
            pendingCount,
            failedCount,
            completionRate,
            totalSpent,
            activityCounts,
        };
    }, [sortedItems]);

    // 状态筛选
    const displayItems = useMemo(() => {
        if (statusFilter === 'all') return sortedItems;
        return sortedItems.filter((i) => i.status === statusFilter);
    }, [sortedItems, statusFilter]);

    // 当前时段
    const currentPeriod = getPeriodByMinutes(currentTime.minutes);

    // 区分已完成与未完成安排（单行展示）
    const completedItems = useMemo(() => {
        return displayItems.filter((i) => i.status === 'completed');
    }, [displayItems]);

    const unfinishedItems = useMemo(() => {
        return displayItems.filter((i) => i.status !== 'completed');
    }, [displayItems]);

    if (loading && !sortedItems.length) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-xs">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-orange-500 border-t-transparent" />
                <p className="mt-3 text-sm font-semibold text-slate-700">正在整理今日日程安排…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div
                role="alert"
                className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/60 p-8 text-center"
            >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                </div>
                <h3 className="mt-2.5 text-sm font-bold text-red-800">今日日程加载失败</h3>
                <p className="mt-1 text-xs text-red-600">请检查网络或点击右上角刷新重试</p>
            </div>
        );
    }

    if (!sortedItems.length) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white p-10 text-center shadow-xs">
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                    <Clock3 className="h-7 w-7" />
                    <Sparkles className="absolute -bottom-1 -right-1 h-4 w-4 text-amber-500" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800">今天还没有安排</h3>
                <p className="mt-1 text-xs text-slate-400">居民们正在自由享受生活，新计划会自动出现</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            {/* 顶栏 1：控制与状态筛选 */}
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    {/* 左侧：时间与达成率简报 */}
                    <div className="flex items-center gap-2.5">
                        <div className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200/80 bg-white px-2.5 py-1 text-xs shadow-2xs">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                            </span>
                            <span className="font-semibold text-slate-700">时间</span>
                            <span className="font-mono font-bold text-orange-600">
                                {currentTime.timeString}
                            </span>
                            <span className="text-[10px] text-slate-400">·</span>
                            <span className="text-[11px] font-medium text-slate-500">
                                {currentPeriod.name}
                            </span>
                        </div>

                        {/* 达成情况 */}
                        <div className="flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-2xs">
                            <span>达成</span>
                            <strong className="font-mono text-emerald-600">
                                {stats.completedCount}/{stats.totalCount}
                            </strong>
                            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                    style={{width: `${stats.completionRate}%`}}
                                />
                            </div>
                            <span className="font-mono text-[10px] text-slate-400">
                                {stats.completionRate}%
                            </span>
                        </div>
                    </div>

                    {/* 右侧：状态快捷过滤胶囊 */}
                    <div className="flex items-center rounded-lg bg-slate-200/60 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                statusFilter === 'all'
                                    ? 'bg-white font-semibold text-slate-800 shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <span>全部</span>
                            <span className="font-mono text-[10px] text-slate-400">
                                {stats.totalCount}
                            </span>
                        </button>
                        {stats.runningCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setStatusFilter('running')}
                                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                    statusFilter === 'running'
                                        ? 'bg-white font-semibold text-blue-700 shadow-2xs'
                                        : 'text-blue-600 hover:text-blue-800'
                                }`}
                            >
                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                                <span>进行中</span>
                                <span className="font-mono text-[10px]">{stats.runningCount}</span>
                            </button>
                        )}
                        {stats.pendingCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setStatusFilter('pending')}
                                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                    statusFilter === 'pending'
                                        ? 'bg-white font-semibold text-amber-700 shadow-2xs'
                                        : 'text-amber-600 hover:text-amber-800'
                                }`}
                            >
                                <span>待办</span>
                                <span className="font-mono text-[10px]">{stats.pendingCount}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setStatusFilter('completed')}
                            className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                statusFilter === 'completed'
                                    ? 'bg-white font-semibold text-emerald-700 shadow-2xs'
                                    : 'text-emerald-600 hover:text-emerald-800'
                            }`}
                        >
                            <span>已完成</span>
                            <span className="font-mono text-[10px]">{stats.completedCount}</span>
                        </button>
                        {stats.failedCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setStatusFilter('failed')}
                                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-all ${
                                    statusFilter === 'failed'
                                        ? 'bg-white font-semibold text-rose-700 shadow-2xs'
                                        : 'text-rose-600 hover:text-rose-800'
                                }`}
                            >
                                <span>失败</span>
                                <span className="font-mono text-[10px]">{stats.failedCount}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 顶栏 2：【24小时全景微缩时间刻度光轨】 */}
            <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-1.5">
                <Day24HourRibbon
                    items={sortedItems}
                    currentMinutes={currentTime.minutes}
                    currentTimeString={currentTime.timeString}
                    onSelectItem={onSelectItem}
                />
            </div>

            {/* 主内容区域：单行已完成 -> 当前时间标尺 -> 单行未完成 -> 常驻实时大盘 */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 sm:p-4 space-y-3.5">
                {/* 1. 已完成安排（单行横向排布） */}
                <div>
                    <div className="flex items-center justify-between pb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>已完成安排</span>
                            <span className="font-mono text-[11px] font-normal text-slate-400">
                                ({completedItems.length})
                            </span>
                        </div>
                    </div>

                    {completedItems.length > 0 ? (
                        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1">
                            {completedItems.map((item) => (
                                <div key={item.id} className="w-72 shrink-0">
                                    <CompactGridCard
                                        item={item}
                                        agent={agentById.get(item.actorId)}
                                        onSelect={() => onSelectItem(item.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-3 py-2.5 text-center text-xs text-slate-400">
                            今日暂无已完成安排
                        </div>
                    )}
                </div>

                {/* 2. 当前时刻分割带 */}
                <CurrentDividerBar
                    timeString={currentTime.timeString}
                    hoursRemaining={currentTime.hoursRemaining}
                    unfinishedCount={unfinishedItems.length}
                />

                {/* 3. 未完成安排（单行横向排布） */}
                <div>
                    <div className="flex items-center justify-between pb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                            <Clock className="h-3.5 w-3.5 text-amber-500" />
                            <span>待处理与进行中安排</span>
                            <span className="font-mono text-[11px] font-normal text-slate-400">
                                ({unfinishedItems.length})
                            </span>
                        </div>
                    </div>

                    {unfinishedItems.length > 0 ? (
                        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1">
                            {unfinishedItems.map((item) => (
                                <div key={item.id} className="w-72 shrink-0">
                                    <CompactGridCard
                                        item={item}
                                        agent={agentById.get(item.actorId)}
                                        isFuture
                                        onSelect={() => onSelectItem(item.id)}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-emerald-200/80 bg-emerald-50/20 px-3 py-2.5 text-center text-xs text-emerald-700">
                            🎉 今日所有安排已全部完成，居民自由休憩中 ✨
                        </div>
                    )}
                </div>

                {/* 4. 常驻实时概览面板（图一对应）：生活节律、活动构成、财务与达成率 */}
                <TodayInsightsSection stats={stats} agents={agents} items={sortedItems} />
            </div>

            {/* 分页控制（超过100条时提供） */}
            {total > 100 && (
                <div className="flex shrink-0 items-center justify-between border-t border-slate-100 bg-white px-4 py-2 text-xs text-slate-500">
                    <span className="text-[11px]">
                        共 <strong className="font-semibold text-slate-700">{total}</strong> 项日程
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">第 {page} 页</span>
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => onPageChange(page - 1)}
                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                            <ChevronLeft className="h-3 w-3 shrink-0" />
                            上一页
                        </button>
                        <button
                            type="button"
                            disabled={page * 100 >= total}
                            onClick={() => onPageChange(page + 1)}
                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                            下一页
                            <ChevronRight className="h-3 w-3 shrink-0" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// =========================================================================
// 24小时全景微缩光轨 (24-Hour Ribbon)
// =========================================================================
function Day24HourRibbon({
    items,
    currentMinutes,
    currentTimeString,
    onSelectItem,
}: {
    items: LifeItem[];
    currentMinutes: number;
    currentTimeString: string;
    onSelectItem: (id: string) => void;
}) {
    const currentPercent = Math.min(100, Math.max(0, (currentMinutes / 1440) * 100));

    return (
        <div className="flex items-center gap-3">
            <span className="shrink-0 font-mono text-[10px] font-semibold text-slate-400">
                00:00
            </span>

            {/* 轨道主容器 */}
            <div className="relative h-4.5 flex-1 rounded-full bg-slate-100 p-0.5">
                {/* 已度过的今日时间渐变 */}
                <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-100/60 to-orange-200/80 transition-all duration-500"
                    style={{width: `${currentPercent}%`}}
                />

                {/* 刻度辅助点（每 3 小时一个点） */}
                {[3, 6, 9, 12, 15, 18, 21].map((h) => {
                    const pct = (h / 24) * 100;
                    return (
                        <span
                            key={h}
                            className="pointer-events-none absolute top-1/2 h-1.5 w-0.5 -translate-y-1/2 bg-slate-300/80"
                            style={{left: `${pct}%`}}
                        />
                    );
                })}

                {/* 日程任务在轨道上的点位 */}
                {items.map((item) => {
                    const m = parseShanghaiMinutes(item.scheduledAt);
                    const pct = Math.min(99, Math.max(1, (m / 1440) * 100));
                    const actMeta = getActivityMeta(item.activity);
                    const timeStr = formatShanghaiTime(item.scheduledAt);

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectItem(item.id)}
                            title={`${timeStr} · ${activityLabels[item.activity] || item.activity}`}
                            className="group/dot absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
                            style={{left: `${pct}%`}}
                        >
                            <span
                                className={`block h-2.5 w-2.5 rounded-full border border-white shadow-2xs transition-transform group-hover/dot:scale-150 ${actMeta.dotColor}`}
                            />
                        </button>
                    );
                })}

                {/* 当前时间指示标尺 */}
                <div
                    className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                    style={{left: `${currentPercent}%`}}
                >
                    <span className="relative flex h-3 w-3 items-center justify-center">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-600 ring-2 ring-white" />
                    </span>
                    <span className="absolute -top-4 left-1/2 -translate-x-1/2 rounded bg-orange-600 px-1 py-0.2 font-mono text-[9px] font-bold text-white shadow-2xs">
                        {currentTimeString}
                    </span>
                </div>
            </div>

            <span className="shrink-0 font-mono text-[10px] font-semibold text-slate-400">
                24:00
            </span>
        </div>
    );
}

// =========================================================================
// 组件：紧凑规整卡片 (Compact Grid Card) —— 无冗长描述，双行极简防溢出
// =========================================================================
function CompactGridCard({
    item,
    agent,
    isFuture = false,
    onSelect,
}: {
    item: LifeItem;
    agent?: AgentConfig;
    isFuture?: boolean;
    onSelect: () => void;
}) {
    const actorName = agent?.name || '居民';
    const actMeta = getActivityMeta(item.activity);
    const ActIcon = actMeta.icon;
    const statusMeta = statusMetaConfig[item.status] || {
        label: statusLabels[item.status] || item.status,
        badgeColor: 'bg-slate-50 text-slate-600 border-slate-200',
        nodeBorder: 'border-slate-300',
        nodeBg: 'bg-slate-50',
        nodeText: 'text-slate-500',
        icon: Clock,
    };
    const timeStr = formatShanghaiTime(item.scheduledAt);
    const showBudget = showsLifeBudget(item);
    const hasSpent = parseFloat(item.spent || '0') > 0;
    const isFailed = item.status === 'failed';
    const isRunning = item.status === 'running';

    const intentTitle = activityLabels[item.activity] || item.activity;
    const isManual = item.intent?.includes('手动') || item.result?.reason?.includes('手动');

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`group relative flex w-full flex-col justify-between overflow-hidden rounded-xl border p-2.5 sm:p-3 text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                isRunning
                    ? 'border-blue-300 bg-blue-50/20 shadow-xs ring-1 ring-blue-500/20'
                    : isFailed
                      ? 'border-rose-200 bg-rose-50/20 hover:border-rose-300'
                      : isFuture
                        ? 'border-slate-200/70 bg-white/90 hover:border-orange-300 hover:shadow-2xs'
                        : 'border-slate-200 bg-white hover:border-orange-300 hover:shadow-2xs'
            }`}
        >
            {/* 左侧活动标识彩条 */}
            <span
                className={`absolute bottom-2 left-0 top-2 w-1 rounded-r-full ${actMeta.accentBar}`}
                aria-hidden="true"
            />

            {/* 顶行：时间 + 居民 + 活动徽标 + 状态 */}
            <div className="flex items-center justify-between gap-1.5 pl-1.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span
                        className={`font-mono text-xs font-bold tabular-nums shrink-0 ${
                            isRunning ? 'text-blue-600' : 'text-slate-800'
                        }`}
                    >
                        {timeStr}
                    </span>
                    <AgentAvatar name={actorName} avatar={agent?.avatar} size="xs" />
                    <span className="truncate text-xs font-semibold text-slate-700 max-w-[70px] sm:max-w-[85px]">
                        {actorName}
                    </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {/* 活动胶囊 */}
                    <span
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap ${actMeta.badgeColor}`}
                    >
                        <ActIcon className="h-2.5 w-2.5 shrink-0" />
                        <span>{intentTitle}</span>
                    </span>

                    {/* 状态徽标 */}
                    <span
                        className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-medium leading-none whitespace-nowrap ${statusMeta.badgeColor}`}
                    >
                        {statusMeta.pulse && (
                            <span className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
                        )}
                        <span>{statusMeta.label}</span>
                    </span>
                </div>
            </div>

            {/* 底行：执行模式/失败提示 + 预算/支出 + 详情操作 */}
            <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100/80 pt-1.5 pl-1.5 text-[10px] min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                    {/* 手动 / 自主 */}
                    {isManual ? (
                        <span className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200/60 whitespace-nowrap">
                            手动执行
                        </span>
                    ) : (
                        <span className="shrink-0 text-[10px] text-slate-400 bg-slate-50 px-1 py-0.2 rounded border border-slate-100 whitespace-nowrap">
                            自主决策
                        </span>
                    )}

                    {/* 失败标记 */}
                    {isFailed && (
                        <span className="shrink-0 text-[10px] font-medium text-rose-600 bg-rose-50 px-1 py-0.2 rounded border border-rose-200/60 whitespace-nowrap">
                            失败
                        </span>
                    )}

                    {/* 预算与支出 */}
                    {showBudget && (
                        <span className="font-mono text-[10px] truncate shrink-0">
                            {hasSpent ? (
                                <span className="text-orange-600 font-semibold">
                                    支 ¥{item.spent}
                                </span>
                            ) : (
                                <span className="text-slate-500">
                                    预 ¥{item.budget || '0'}
                                </span>
                            )}
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-0.5 text-orange-600 font-medium shrink-0 group-hover:translate-x-0.5 transition-transform">
                    <span>详情</span>
                    <ArrowRight className="h-2.5 w-2.5" />
                </div>
            </div>
        </button>
    );
}

// =========================================================================
// 组件：当前时间标尺横条 (Current Divider Bar)
// =========================================================================
function CurrentDividerBar({
    timeString,
    hoursRemaining,
    unfinishedCount,
}: {
    timeString: string;
    hoursRemaining: number;
    unfinishedCount: number;
}) {
    return (
        <div className="relative my-2.5 flex items-center gap-2">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-orange-300 to-orange-400" />

            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50/90 px-3 py-1 text-xs text-orange-800 shadow-2xs">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                </span>
                <span className="font-semibold">当前时刻</span>
                <span className="font-mono font-bold text-orange-600">{timeString}</span>
                <span className="text-orange-400">·</span>
                <span className="text-[11px] text-orange-700">
                    {unfinishedCount > 0
                        ? `距今日结束还剩 ${hoursRemaining} 小时 · 剩余 ${unfinishedCount} 项待处理`
                        : '今日已完成所有安排，居民自由休憩中 ✨'}
                </span>
            </div>

            <div className="h-px flex-1 bg-gradient-to-r from-orange-400 via-orange-300 to-transparent" />
        </div>
    );
}

// =========================================================================
// 组件：今日生活概览与节律（图一对应：常驻实时大盘）
// =========================================================================
function TodayInsightsSection({
    stats,
    agents,
    items,
}: {
    stats: {
        totalCount: number;
        completedCount: number;
        runningCount: number;
        pendingCount: number;
        failedCount: number;
        completionRate: number;
        totalSpent: number;
        activityCounts: Record<string, number>;
    };
    agents: AgentConfig[];
    items: LifeItem[];
}) {
    // 当天有安排的所有活跃居民
    const activeAgents = agents.filter((a) =>
        items.some((i) => i.actorId === a.id)
    );

    return (
        <div className="mt-3 rounded-xl border border-slate-200/80 bg-gradient-to-b from-slate-50/60 to-white p-3.5 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Sparkles className="h-3.5 w-3.5 text-orange-500" />
                    <span>今日居民生活概览与节律</span>
                </div>
                <span className="text-[11px] text-slate-400">
                    今日共产生 {stats.totalCount} 项生活行为
                </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* 卡片 1：今日活跃居民 */}
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <span className="text-[11px] text-slate-400">今日活跃居民</span>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {activeAgents.length > 0 ? (
                            activeAgents.map((agent) => (
                                <div key={agent.id} className="flex items-center gap-1.5">
                                    <AgentAvatar name={agent.name} avatar={agent.avatar} size="xs" />
                                    <span className="text-xs font-semibold text-slate-700">
                                        {agent.name}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <span className="text-xs text-slate-400">暂无活跃居民</span>
                        )}
                    </div>
                </div>

                {/* 卡片 2：当天全部活动构成 */}
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <span className="text-[11px] text-slate-400">活动构成</span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {Object.entries(stats.activityCounts).length > 0 ? (
                            Object.entries(stats.activityCounts).map(([act, count]) => {
                                const meta = getActivityMeta(act);
                                const Icon = meta.icon;
                                return (
                                    <span
                                        key={act}
                                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${meta.badgeColor}`}
                                    >
                                        <Icon className="h-2.5 w-2.5" />
                                        <span>
                                            {meta.label} ({count})
                                        </span>
                                    </span>
                                );
                            })
                        ) : (
                            <span className="text-xs text-slate-400">暂无活动构成</span>
                        )}
                    </div>
                </div>

                {/* 卡片 3：今日财务与进度（实时总支出消耗与安排达成率） */}
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <span className="text-[11px] text-slate-400">今日财务与进度</span>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className="text-slate-600">总支出消耗:</span>
                        <span className="font-mono font-bold text-orange-600">
                            ¥{stats.totalSpent.toFixed(1)}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="text-slate-600">安排达成率:</span>
                        <span className="font-mono font-bold text-emerald-600">
                            {stats.completionRate}%
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
