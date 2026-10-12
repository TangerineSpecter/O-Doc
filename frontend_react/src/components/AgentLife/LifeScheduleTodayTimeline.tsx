import {useEffect, useMemo, useState, type ElementType} from 'react';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Calendar,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    Clock3,
    Coffee,
    Compass,
    LayoutGrid,
    List,
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
    Columns3,
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

// 上海时区时间转换
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
    bgClass: string;
    borderClass: string;
    textClass: string;
}

const dayPeriods: DayPeriodMeta[] = [
    {
        id: 'early',
        name: '凌晨清晨',
        range: '00:00 - 08:59',
        minMinutes: 0,
        maxMinutes: 9 * 60,
        icon: Sunrise,
        bgClass: 'bg-indigo-50/60',
        borderClass: 'border-indigo-100',
        textClass: 'text-indigo-700',
    },
    {
        id: 'morning',
        name: '上午时光',
        range: '09:00 - 11:59',
        minMinutes: 9 * 60,
        maxMinutes: 12 * 60,
        icon: Sun,
        bgClass: 'bg-amber-50/60',
        borderClass: 'border-amber-100',
        textClass: 'text-amber-700',
    },
    {
        id: 'afternoon',
        name: '午后傍晚',
        range: '12:00 - 17:59',
        minMinutes: 12 * 60,
        maxMinutes: 18 * 60,
        icon: Sunset,
        bgClass: 'bg-orange-50/60',
        borderClass: 'border-orange-100',
        textClass: 'text-orange-700',
    },
    {
        id: 'night',
        name: '晚间夜幕',
        range: '18:00 - 23:59',
        minMinutes: 18 * 60,
        maxMinutes: 24 * 60,
        icon: Moon,
        bgClass: 'bg-slate-100/70',
        borderClass: 'border-slate-200/80',
        textClass: 'text-slate-700',
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
    // 视图模式：grid (高密度网格卡片), list (超紧凑列表), periods (时段看板)
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'periods'>('grid');
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

    // 统计数据
    const stats = useMemo(() => {
        const totalCount = sortedItems.length;
        const completedCount = sortedItems.filter((i) => i.status === 'completed').length;
        const runningCount = sortedItems.filter((i) => i.status === 'running').length;
        const pendingCount = sortedItems.filter((i) => i.status === 'pending').length;
        const failedCount = sortedItems.filter((i) => i.status === 'failed').length;
        const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

        // 统计涉及的不同居民
        const uniqueAgentIds = new Set(sortedItems.map((i) => i.actorId));
        // 统计总花费
        const totalSpent = sortedItems.reduce((acc, i) => acc + (parseFloat(i.spent || '0') || 0), 0);

        // 活动类型分布
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
            uniqueAgentsCount: uniqueAgentIds.size,
            totalSpent,
            activityCounts,
        };
    }, [sortedItems]);

    // 过滤列表
    const displayItems = useMemo(() => {
        if (statusFilter === 'all') return sortedItems;
        return sortedItems.filter((i) => i.status === statusFilter);
    }, [sortedItems, statusFilter]);

    // 当前时段
    const currentPeriod = getPeriodByMinutes(currentTime.minutes);

    // 将已过去日程与未来待办日程划分（用于插入当前时间指示标尺）
    const {pastItems, futureItems} = useMemo(() => {
        const past: LifeItem[] = [];
        const future: LifeItem[] = [];
        for (const item of displayItems) {
            const m = parseShanghaiMinutes(item.scheduledAt);
            if (m <= currentTime.minutes) {
                past.push(item);
            } else {
                future.push(item);
            }
        }
        return {pastItems: past, futureItems: future};
    }, [displayItems, currentTime.minutes]);

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
            {/* 顶栏 1：控制与关键状态过滤 */}
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-4 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                    {/* 左侧：今日完成度与时间指示 */}
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

                        {/* 完成度简报 */}
                        <div className="hidden sm:flex items-center gap-2 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1 text-xs text-slate-600 shadow-2xs">
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

                    {/* 右侧：状态过滤胶囊 + 视图切换 */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* 状态过滤 */}
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

                        {/* 视图模式：卡片网格 vs 紧凑列表 vs 时段看板 */}
                        <div className="flex items-center rounded-lg border border-slate-200/80 bg-white p-0.5 shadow-2xs">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                title="网格卡片视图：双列展开，高利用率"
                                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                                    viewMode === 'grid'
                                        ? 'bg-orange-50 font-semibold text-orange-600'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <LayoutGrid className="h-3 w-3 shrink-0" />
                                <span>网格</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                title="紧凑清单视图：一屏容纳更多行"
                                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                                    viewMode === 'list'
                                        ? 'bg-orange-50 font-semibold text-orange-600'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <List className="h-3 w-3 shrink-0" />
                                <span>清单</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('periods')}
                                title="时段看板视图：按时段分列"
                                className={`inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all ${
                                    viewMode === 'periods'
                                        ? 'bg-orange-50 font-semibold text-orange-600'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Columns3 className="h-3 w-3 shrink-0" />
                                <span>时段</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 顶栏 2：【24小时全景微缩时间刻度光轨】（仅占 36px，纵览全天并精确指示当前时间） */}
            <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-1.5">
                <Day24HourRibbon
                    items={sortedItems}
                    currentMinutes={currentTime.minutes}
                    currentTimeString={currentTime.timeString}
                    onSelectItem={onSelectItem}
                />
            </div>

            {/* 主内容区域：占满宽度，紧凑无浪费 */}
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-3 sm:p-4">
                {displayItems.length === 0 ? (
                    <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                        <Clock className="h-6 w-6 text-slate-300" />
                        <p className="mt-1.5 text-xs text-slate-500">
                            未找到符合当前筛选条件的安排
                        </p>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('all')}
                            className="mt-2 text-xs font-semibold text-orange-600 hover:underline"
                        >
                            清除筛选
                        </button>
                    </div>
                ) : viewMode === 'grid' ? (
                    /* ======================================================== */
                    /* 模式 1：高利用率卡片网格（Grid）                          */
                    /* ======================================================== */
                    <div className="space-y-3">
                        {/* 1. 已过去的日程 */}
                        {pastItems.length > 0 && (
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {pastItems.map((item) => (
                                    <CompactGridCard
                                        key={item.id}
                                        item={item}
                                        agent={agentById.get(item.actorId)}
                                        onSelect={() => onSelectItem(item.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* 2. 当前时间线分隔带（仅在全部筛选下展示） */}
                        {statusFilter === 'all' && (
                            <CurrentDividerBar
                                timeString={currentTime.timeString}
                                hoursRemaining={currentTime.hoursRemaining}
                                hasFuture={futureItems.length > 0}
                            />
                        )}

                        {/* 3. 未来的日程 */}
                        {futureItems.length > 0 && (
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {futureItems.map((item) => (
                                    <CompactGridCard
                                        key={item.id}
                                        item={item}
                                        agent={agentById.get(item.actorId)}
                                        isFuture
                                        onSelect={() => onSelectItem(item.id)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* 当今天日程总数较少（<= 4 项）时，下方填充今日生活洞察与状态概览，消除空洞白斑 */}
                        {sortedItems.length <= 4 && statusFilter === 'all' && (
                            <TodayInsightsSection stats={stats} agents={agents} items={sortedItems} />
                        )}
                    </div>
                ) : viewMode === 'list' ? (
                    /* ======================================================== */
                    /* 模式 2：超紧凑单行清单模式（List）                         */
                    /* ======================================================== */
                    <div className="space-y-1.5">
                        {/* 已过日程行 */}
                        {pastItems.map((item) => (
                            <CompactListRow
                                key={item.id}
                                item={item}
                                agent={agentById.get(item.actorId)}
                                onSelect={() => onSelectItem(item.id)}
                            />
                        ))}

                        {/* 当前时间分隔条 */}
                        {statusFilter === 'all' && (
                            <CurrentDividerBar
                                timeString={currentTime.timeString}
                                hoursRemaining={currentTime.hoursRemaining}
                                hasFuture={futureItems.length > 0}
                            />
                        )}

                        {/* 未来日程行 */}
                        {futureItems.map((item) => (
                            <CompactListRow
                                key={item.id}
                                item={item}
                                agent={agentById.get(item.actorId)}
                                isFuture
                                onSelect={() => onSelectItem(item.id)}
                            />
                        ))}

                        {sortedItems.length <= 4 && statusFilter === 'all' && (
                            <div className="pt-3">
                                <TodayInsightsSection stats={stats} agents={agents} items={sortedItems} />
                            </div>
                        )}
                    </div>
                ) : (
                    /* ======================================================== */
                    /* 模式 3：自适应时段看板（Periods）                         */
                    /* ======================================================== */
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {dayPeriods.map((period) => {
                            const periodItems = displayItems.filter((i) => {
                                const m = parseShanghaiMinutes(i.scheduledAt);
                                return m >= period.minMinutes && m < period.maxMinutes;
                            });

                            const isCurrentPeriod = currentPeriod.id === period.id;
                            const Icon = period.icon;

                            return (
                                <section
                                    key={period.id}
                                    className={`flex flex-col rounded-xl border p-2.5 transition-all ${
                                        isCurrentPeriod
                                            ? 'border-orange-300 bg-orange-50/20 shadow-2xs ring-1 ring-orange-400/20'
                                            : 'border-slate-200/80 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <div className="flex items-center gap-1.5">
                                            <span
                                                className={`flex h-5 w-5 items-center justify-center rounded border ${period.bgClass} ${period.borderClass} ${period.textClass}`}
                                            >
                                                <Icon className="h-3 w-3" />
                                            </span>
                                            <span className="text-xs font-bold text-slate-800">
                                                {period.name}
                                            </span>
                                            <span className="font-mono text-[10px] text-slate-400">
                                                {period.range}
                                            </span>
                                        </div>

                                        {isCurrentPeriod ? (
                                            <span className="rounded-full bg-orange-500 px-1.5 py-0.2 text-[9px] font-bold text-white">
                                                当前
                                            </span>
                                        ) : (
                                            <span className="font-mono text-[10px] text-slate-400">
                                                {periodItems.length}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-2 space-y-1.5">
                                        {periodItems.length > 0 ? (
                                            periodItems.map((item) => (
                                                <CompactGridCard
                                                    key={item.id}
                                                    item={item}
                                                    agent={agentById.get(item.actorId)}
                                                    onSelect={() => onSelectItem(item.id)}
                                                    dense
                                                />
                                            ))
                                        ) : (
                                            <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-slate-100 text-[11px] text-slate-300">
                                                无安排
                                            </div>
                                        )}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
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
// 组件：紧凑网格卡片 (Compact Grid Card)
// =========================================================================
function CompactGridCard({
    item,
    agent,
    isFuture = false,
    dense = false,
    onSelect,
}: {
    item: LifeItem;
    agent?: AgentConfig;
    isFuture?: boolean;
    dense?: boolean;
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
    const isFailed = item.status === 'failed' && Boolean(item.result?.reason);
    const isRunning = item.status === 'running';

    const intentTitle = activityLabels[item.activity] || item.activity;
    const descriptionText =
        (isFailed ? item.result?.reason : item.intent) || '生活安排已就绪';

    const isManual = descriptionText.includes('手动') || Boolean(item.intent?.includes('手动'));

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`group relative flex w-full flex-col rounded-xl border text-left transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
                dense ? 'p-2' : 'p-2.5 sm:p-3'
            } ${
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
            <div className="flex items-center justify-between gap-1.5 pl-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span
                        className={`font-mono text-xs font-bold tabular-nums ${
                            isRunning ? 'text-blue-600' : 'text-slate-800'
                        }`}
                    >
                        {timeStr}
                    </span>
                    <AgentAvatar name={actorName} avatar={agent?.avatar} size="xs" />
                    <span className="truncate text-xs font-semibold text-slate-700">
                        {actorName}
                    </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                    {/* 活动胶囊 */}
                    <span
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.2 text-[10px] font-medium ${actMeta.badgeColor}`}
                    >
                        <ActIcon className="h-2.5 w-2.5" />
                        <span>{intentTitle}</span>
                    </span>

                    {/* 状态徽标 */}
                    <span
                        className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.2 text-[9px] font-medium leading-none ${statusMeta.badgeColor}`}
                    >
                        {statusMeta.pulse && (
                            <span className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
                        )}
                        <span>{statusMeta.label}</span>
                    </span>
                </div>
            </div>

            {/* 中行：意图摘要与手动执行小标签 */}
            <div className="mt-1.5 flex items-center justify-between gap-1 pl-1.5 text-xs">
                <p
                    className={`truncate text-[11px] leading-relaxed ${
                        isFailed ? 'text-rose-600 font-medium' : 'text-slate-600'
                    }`}
                >
                    {descriptionText}
                </p>

                {isManual ? (
                    <span className="shrink-0 text-[10px] font-medium text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200/60">
                        手动
                    </span>
                ) : (
                    <span className="shrink-0 text-[10px] text-slate-400">
                        自主
                    </span>
                )}
            </div>

            {/* 底行：预算与查看详情 */}
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5 pl-1.5 text-[10px] text-slate-400">
                <div>
                    {showBudget && (
                        <span className="font-mono text-[10px]">
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

                <div className="flex items-center gap-0.5 text-orange-600 font-medium transition-transform group-hover:translate-x-0.5">
                    <span>详情</span>
                    <ArrowRight className="h-2.5 w-2.5" />
                </div>
            </div>
        </button>
    );
}

// =========================================================================
// 组件：超紧凑单行列表项 (Compact List Row)
// =========================================================================
function CompactListRow({
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
    const isFailed = item.status === 'failed' && Boolean(item.result?.reason);
    const isRunning = item.status === 'running';

    const intentTitle = activityLabels[item.activity] || item.activity;
    const descriptionText =
        (isFailed ? item.result?.reason : item.intent) || '生活安排已就绪';

    const isManual = descriptionText.includes('手动') || Boolean(item.intent?.includes('手动'));

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`group relative flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-orange-500/20 ${
                isRunning
                    ? 'border-blue-300 bg-blue-50/20'
                    : isFailed
                      ? 'border-rose-200 bg-rose-50/20'
                      : isFuture
                        ? 'border-slate-200/60 bg-white/70 hover:border-orange-300'
                        : 'border-slate-200/80 bg-white hover:border-orange-300 hover:shadow-2xs'
            }`}
        >
            {/* 左侧条目信息 */}
            <div className="flex min-w-0 items-center gap-2.5 flex-1">
                {/* 时间 */}
                <span className="font-mono text-xs font-bold tabular-nums text-slate-800 shrink-0">
                    {timeStr}
                </span>

                {/* 状态徽标 */}
                <span
                    className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.2 text-[9px] font-medium leading-none ${statusMeta.badgeColor}`}
                >
                    {statusMeta.pulse && (
                        <span className="h-1 w-1 animate-pulse rounded-full bg-blue-500" />
                    )}
                    <span>{statusMeta.label}</span>
                </span>

                {/* 居民头像与名称 */}
                <div className="flex items-center gap-1 shrink-0">
                    <AgentAvatar name={actorName} avatar={agent?.avatar} size="xs" />
                    <span className="text-xs font-semibold text-slate-700">{actorName}</span>
                </div>

                {/* 活动类型 */}
                <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.2 text-[10px] font-medium ${actMeta.badgeColor}`}
                >
                    <ActIcon className="h-2.5 w-2.5" />
                    <span>{intentTitle}</span>
                </span>

                {/* 意图描述 */}
                <span
                    className={`truncate text-xs ${
                        isFailed ? 'text-rose-600 font-medium' : 'text-slate-500'
                    }`}
                >
                    {descriptionText}
                </span>
            </div>

            {/* 右侧：手动标识与详情按钮 */}
            <div className="flex items-center gap-2 shrink-0">
                {isManual && (
                    <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1 py-0.2 rounded border border-amber-200/60">
                        手动执行
                    </span>
                )}
                <span className="flex items-center gap-0.5 text-xs text-orange-600 font-medium group-hover:translate-x-0.5 transition-transform">
                    <span>详情</span>
                    <ArrowRight className="h-3 w-3" />
                </span>
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
    hasFuture,
}: {
    timeString: string;
    hoursRemaining: number;
    hasFuture: boolean;
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
                    {hasFuture
                        ? `距今日结束还剩 ${hoursRemaining} 小时`
                        : '今日已完成所有安排，居民自由休憩中 ✨'}
                </span>
            </div>

            <div className="h-px flex-1 bg-gradient-to-r from-orange-400 via-orange-300 to-transparent" />
        </div>
    );
}

// =========================================================================
// 组件：今日生活概览与统计面板（消除少数据时的空白浪费）
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
        uniqueAgentsCount: number;
        totalSpent: number;
        activityCounts: Record<string, number>;
    };
    agents: AgentConfig[];
    items: LifeItem[];
}) {
    const activeAgents = agents.filter((a) =>
        items.some((i) => i.actorId === a.id)
    );

    return (
        <div className="mt-4 rounded-xl border border-slate-200/70 bg-gradient-to-b from-slate-50/60 to-white p-3.5 shadow-2xs">
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
                {/* 卡片 1：参与居民 */}
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <span className="text-[11px] text-slate-400">今日活跃居民</span>
                    <div className="mt-2 flex items-center gap-2">
                        {activeAgents.map((agent) => (
                            <div key={agent.id} className="flex items-center gap-1.5">
                                <AgentAvatar name={agent.name} avatar={agent.avatar} size="xs" />
                                <span className="text-xs font-semibold text-slate-700">
                                    {agent.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 卡片 2：生活活动分布 */}
                <div className="rounded-lg border border-slate-100 bg-white p-2.5">
                    <span className="text-[11px] text-slate-400">活动构成</span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {Object.entries(stats.activityCounts).map(([act, count]) => {
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
                        })}
                    </div>
                </div>

                {/* 卡片 3：消费与状态 */}
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
