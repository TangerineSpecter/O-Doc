import {ChevronLeft, ChevronRight, Clock3} from 'lucide-react';
import type {LifeItem} from '../../types/api/agentLife';
import type {AgentConfig} from '../../types/api/setting';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import {activityLabels, statusLabels} from './lifeLabels';

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

const statusClass: Record<string, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    running: 'border-blue-200 bg-blue-50 text-blue-700',
    completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    failed: 'border-rose-200 bg-rose-50 text-rose-700',
    deferred: 'border-purple-200 bg-purple-50 text-purple-700',
    rest: 'border-slate-200 bg-slate-100 text-slate-600',
    paused: 'border-slate-200 bg-slate-100 text-slate-600',
    cancelled: 'border-slate-200 bg-slate-100 text-slate-500',
};

const timeLabel = (value: string) =>
    new Date(value).toLocaleTimeString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

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
    const agentById = new Map(agents.map((agent) => [agent.id, agent]));
    const orderedItems = items.slice().sort(
        (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

    if (loading && !orderedItems.length) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">
                正在加载今日安排…
            </div>
        );
    }

    if (error) {
        return (
            <div role="alert" className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-sm text-red-600">
                今日安排加载失败，请刷新重试
            </div>
        );
    }

    if (!orderedItems.length) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white text-center shadow-xs">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-500">
                    <Clock3 className="h-5 w-5" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-slate-800">今天还没有安排</h3>
                <p className="mt-1 text-xs text-slate-400">居民的新计划会按时间出现在这里</p>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
                <div className="relative flex h-full min-h-[260px] w-max min-w-full items-start gap-3 px-6 py-5">
                    <div className="pointer-events-none absolute left-9 right-9 top-[34px] h-px bg-gradient-to-r from-orange-200 via-slate-200 to-orange-200" />
                    {orderedItems.map((item) => {
                        const agent = agentById.get(item.actorId);
                        const actorName = agent?.name || '居民';
                        const description = item.status === 'failed' && item.result?.reason
                            ? item.result.reason
                            : item.intent || '安排已就绪';

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onSelectItem(item.id)}
                                title={`${timeLabel(item.scheduledAt)} · ${actorName} · ${activityLabels[item.activity] || item.activity}`}
                                className="group relative z-10 flex w-[260px] shrink-0 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 sm:w-[280px]"
                            >
                                <span className="mb-3 flex h-7 items-center gap-2 pl-1">
                                    <span className="h-3 w-3 shrink-0 rounded-full border-[3px] border-white bg-orange-500 ring-2 ring-orange-200 transition-transform group-hover:scale-125" />
                                    <time className="font-mono text-sm font-bold tabular-nums text-slate-800">
                                        {timeLabel(item.scheduledAt)}
                                    </time>
                                </span>
                                <span className="flex min-h-[172px] flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xs transition-all group-hover:-translate-y-0.5 group-hover:border-orange-300 group-hover:shadow-sm">
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        <AgentAvatar name={actorName} avatar={agent?.avatar} size="sm" />
                                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
                                            {actorName}
                                        </span>
                                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClass[item.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                            {statusLabels[item.status] || item.status}
                                        </span>
                                    </span>
                                    <span className="mt-3 truncate text-[13px] font-bold text-slate-900">
                                        {activityLabels[item.activity] || item.activity}
                                    </span>
                                    <span className="mt-1.5 line-clamp-2 min-h-9 text-xs leading-relaxed text-slate-500">
                                        {description}
                                    </span>
                                    <span className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[10px] text-slate-400">
                                        <span className="truncate">查看安排详情</span>
                                        <span className="shrink-0 text-orange-500">打开 →</span>
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {total > 100 && (
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                    <span className="mr-1">第 {page} 页 · 共 {total} 项</span>
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => onPageChange(page - 1)}
                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
                        上一页
                    </button>
                    <button
                        type="button"
                        disabled={page * 100 >= total}
                        onClick={() => onPageChange(page + 1)}
                        className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                        下一页
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                    </button>
                </div>
            )}
        </div>
    );
}
