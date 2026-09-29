import type {ElementType} from 'react';
import {
    Compass,
    Sprout,
    MessageSquare,
    Send,
    ShoppingBag,
    TrendingUp,
    Coffee,
    Calendar,
    Activity,
} from 'lucide-react';
import type {LifeItem} from '../../types/api/agentLife';
import {activityLabels, statusLabels} from './lifeLabels';

interface LifeScheduleCardProps {
    item: LifeItem;
    actorName: string;
    onClick: () => void;
    density?: 'compact' | 'normal';
    viewMode?: 'week' | 'list';
}

const activityConfig: Record<
    string,
    {
        icon: ElementType;
        badgeColor: string;
        accentBar: string;
    }
> = {
    travel: {
        icon: Compass,
        badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-100',
        accentBar: 'bg-cyan-500',
    },
    farm: {
        icon: Sprout,
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        accentBar: 'bg-emerald-500',
    },
    post_interaction: {
        icon: MessageSquare,
        badgeColor: 'bg-blue-50 text-blue-700 border-blue-100',
        accentBar: 'bg-blue-500',
    },
    post_publish: {
        icon: Send,
        badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        accentBar: 'bg-indigo-500',
    },
    market_prepare: {
        icon: ShoppingBag,
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-100',
        accentBar: 'bg-amber-500',
    },
    investment: {
        icon: TrendingUp,
        badgeColor: 'bg-lime-50 text-lime-700 border-lime-100',
        accentBar: 'bg-lime-600',
    },
    rest: {
        icon: Coffee,
        badgeColor: 'bg-rose-50 text-rose-700 border-rose-100',
        accentBar: 'bg-rose-400',
    },
    unplanned: {
        icon: Calendar,
        badgeColor: 'bg-slate-100 text-slate-600 border-slate-200',
        accentBar: 'bg-slate-400',
    },
};

const statusConfig: Record<string, {label: string; className: string; showPulse?: boolean}> = {
    pending: {
        label: '待执行',
        className: 'bg-amber-50 text-amber-700 border-amber-200/80',
    },
    running: {
        label: '执行中',
        className: 'bg-blue-50 text-blue-700 border-blue-200/80',
        showPulse: true,
    },
    completed: {
        label: '已完成',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    },
    rest: {
        label: '休息',
        className: 'bg-slate-100 text-slate-600 border-slate-200/80',
    },
    failed: {
        label: '失败',
        className: 'bg-rose-50 text-rose-700 border-rose-200/80',
    },
    deferred: {
        label: '已顺延',
        className: 'bg-purple-50 text-purple-700 border-purple-200/80',
    },
    paused: {
        label: '暂停',
        className: 'bg-slate-100 text-slate-600 border-slate-200/80',
    },
    cancelled: {
        label: '已取消',
        className: 'bg-slate-100 text-slate-400 line-through border-slate-200/80',
    },
};

export default function LifeScheduleCard({
    item,
    actorName,
    onClick,
    density = 'compact',
    viewMode = 'week',
}: LifeScheduleCardProps) {
    const config = activityConfig[item.activity] || {
        icon: Activity,
        badgeColor: 'bg-orange-50 text-orange-700 border-orange-100',
        accentBar: 'bg-orange-500',
    };
    const Icon = config.icon;
    const statusInfo = statusConfig[item.status] || {
        label: statusLabels[item.status] || item.status,
        className: 'bg-slate-50 text-slate-600 border-slate-200',
    };

    const timeString = new Date(item.scheduledAt).toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
    });

    const hasSpent = parseFloat(item.spent || '0') > 0;
    const tooltipText = `${activityLabels[item.activity] || item.activity} · ${actorName || '居民'}\n时间：${timeString}\n状态：${statusInfo.label}${item.intent ? `\n意图：${item.intent}` : ''}\n预算：${item.budget} · 已用：${item.spent}`;

    // ==========================================
    // 列表视图专用卡片：适度增加高度，收缩宽度，排版更具呼吸感
    // ==========================================
    if (viewMode === 'list') {
        if (density === 'compact') {
            return (
                <button
                    type="button"
                    onClick={onClick}
                    title={tooltipText}
                    className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3 text-left shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xs hover:bg-orange-50/10 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                    style={{minHeight: '84px'}}
                >
                    {/* 左侧彩色标识条 */}
                    <span
                        className={`absolute bottom-2.5 left-0 top-2.5 w-1 rounded-r-full ${config.accentBar}`}
                        aria-hidden="true"
                    />

                    {/* 顶栏：时间 + 状态微标 */}
                    <div className="flex items-center justify-between gap-1.5 pl-1.5">
                        <span className="font-mono text-xs font-bold text-slate-800">
                            {timeString}
                        </span>
                        <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${statusInfo.className}`}
                        >
                            {statusInfo.showPulse && (
                                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-600" />
                            )}
                            {statusInfo.label}
                        </span>
                    </div>

                    {/* 中间栏：活动图标 + 活动名称 + 居民名 */}
                    <div className="mt-1.5 flex items-center gap-2 pl-1.5">
                        <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border shadow-2xs ${config.badgeColor}`}
                        >
                            <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-bold text-slate-900">
                                    {activityLabels[item.activity] || item.activity}
                                </span>
                                <span className="truncate text-[11px] text-slate-500 font-medium">
                                    · {actorName || '居民'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 底栏：意图摘要与预算 */}
                    <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100/80 pt-1.5 pl-1.5 text-[10px]">
                        <span className="truncate text-slate-500 max-w-[130px]">
                            {item.intent || '安排已就绪'}
                        </span>
                        <span className="shrink-0 font-mono text-slate-400">
                            {hasSpent ? (
                                <span className="font-semibold text-orange-600">支 ¥{item.spent}</span>
                            ) : (
                                <span>预 ¥{item.budget}</span>
                            )}
                        </span>
                    </div>
                </button>
            );
        }

        // 列表视图详细模式（高度约 115px，展示意图卡片）
        return (
            <button
                type="button"
                onClick={onClick}
                title={tooltipText}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-3.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                style={{minHeight: '112px'}}
            >
                <span
                    className={`absolute bottom-3 left-0 top-3 w-1.5 rounded-r-full ${config.accentBar}`}
                    aria-hidden="true"
                />
                {/* 顶栏：时间 + 居民名 + 状态徽标 */}
                <div className="flex items-center justify-between gap-1.5 pl-1.5">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-800">
                            {timeString}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                            {actorName || '居民'}
                        </span>
                    </div>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${statusInfo.className}`}
                    >
                        {statusInfo.showPulse && (
                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-600" />
                        )}
                        {statusInfo.label}
                    </span>
                </div>

                {/* 中间栏：活动图标 + 活动名称 */}
                <div className="mt-2 flex items-center gap-2 pl-1.5">
                    <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border shadow-2xs ${config.badgeColor}`}
                    >
                        <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-bold text-slate-900">
                        {activityLabels[item.activity] || item.activity}
                    </span>
                </div>

                {/* 意图说明 */}
                {item.intent && (
                    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 pl-2.5 ml-1.5">
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                            {item.intent}
                        </p>
                    </div>
                )}

                {/* 底栏：预算与支出 */}
                <div className="mt-2 flex items-center justify-between gap-1 border-t border-slate-100/80 pt-2 pl-1.5 text-[11px] text-slate-400">
                    <span className="font-mono">预：¥{item.budget}</span>
                    <span className="font-mono font-semibold text-orange-600">
                        实支：¥{item.spent}
                    </span>
                </div>
            </button>
        );
    }

    // ==========================================
    // 周日程视图专用卡片：适合 7 列并排的紧凑排版
    // ==========================================
    if (density === 'compact') {
        return (
            <button
                type="button"
                onClick={onClick}
                title={tooltipText}
                className="group relative block w-full rounded-lg border border-slate-200/80 bg-white px-2 py-1.5 text-left shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xs hover:bg-orange-50/20 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
            >
                {/* 左侧活动标识色彩竖条 */}
                <span
                    className={`absolute bottom-1.5 left-0 top-1.5 w-1 rounded-r-full ${config.accentBar}`}
                    aria-hidden="true"
                />

                {/* 第一行：时间 + 活动图标 + 活动名 + 状态微标 */}
                <div className="flex items-center justify-between gap-1 pl-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-slate-700 shrink-0">
                            {timeString}
                        </span>
                        <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${config.badgeColor}`}
                        >
                            <Icon className="h-2.5 w-2.5" />
                        </span>
                        <span className="truncate text-xs font-bold text-slate-800">
                            {activityLabels[item.activity] || item.activity}
                        </span>
                    </div>

                    <span
                        className={`inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium leading-none ${statusInfo.className}`}
                    >
                        {statusInfo.showPulse && (
                            <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-blue-600" />
                        )}
                        {statusInfo.label}
                    </span>
                </div>

                {/* 第二行：居民名 + 意图摘要 + 预算/花费 */}
                <div className="mt-1 flex items-center justify-between gap-1 pl-1 text-[10px]">
                    <div className="flex min-w-0 items-center gap-1">
                        <span className="truncate font-medium text-slate-600 shrink-0 max-w-[64px]">
                            {actorName || '居民'}
                        </span>
                        {item.intent && (
                            <>
                                <span className="text-slate-300">·</span>
                                <span className="truncate text-slate-500">
                                    {item.intent}
                                </span>
                            </>
                        )}
                    </div>

                    <div className="shrink-0 font-mono text-[9px] text-slate-400">
                        {hasSpent ? (
                            <span className="font-semibold text-orange-600">支 ¥{item.spent}</span>
                        ) : (
                            <span>预 ¥{item.budget}</span>
                        )}
                    </div>
                </div>
            </button>
        );
    }

    // 周视图标准宽松模式
    return (
        <button
            type="button"
            onClick={onClick}
            title={tooltipText}
            className="group relative block w-full rounded-xl border border-slate-200/90 bg-white p-2.5 text-left shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        >
            <span
                className={`absolute bottom-2 left-0 top-2 w-1 rounded-r-full ${config.accentBar}`}
                aria-hidden="true"
            />
            <div className="flex items-center justify-between gap-1.5 pl-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${config.badgeColor}`}>
                        <Icon className="h-3 w-3" />
                    </span>
                    <span className="truncate text-xs font-bold text-slate-800">
                        {activityLabels[item.activity] || item.activity}
                    </span>
                </div>
                <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${statusInfo.className}`}
                >
                    {statusInfo.showPulse && (
                        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-blue-600" />
                    )}
                    {statusInfo.label}
                </span>
            </div>

            <div className="mt-1.5 flex items-center justify-between gap-2 pl-1.5 text-[11px] text-slate-500">
                <span className="truncate font-medium text-slate-700">{actorName || '居民'}</span>
                <span className="font-mono text-slate-500">{timeString}</span>
            </div>

            {item.intent && (
                <div className="mt-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-1.5 pl-2">
                    <p className="line-clamp-1 text-[10px] leading-relaxed text-slate-600">
                        {item.intent}
                    </p>
                </div>
            )}

            <div className="mt-1.5 flex items-center justify-between gap-1 border-t border-slate-100/80 pt-1.5 pl-1.5 text-[10px] text-slate-400">
                <span>预 ¥{item.budget} · 支 ¥{item.spent}</span>
            </div>
        </button>
    );
}
