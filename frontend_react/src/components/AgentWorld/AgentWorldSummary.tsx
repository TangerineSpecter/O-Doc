import {useEffect, useState} from 'react';
import {ArrowRight, Bot, CircleAlert, LoaderCircle, RefreshCw, Sparkles} from 'lucide-react';
import {getAgentActivities, getAgentWorldSummary} from '../../api/setting';
import type {AgentActivity, AgentWorldSummary as SummaryData} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';

const formatActivityTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
    return date.toLocaleDateString('zh-CN', {month: 'short', day: 'numeric'});
};

const activityAppearance: Record<AgentActivity['type'], {card: string; label: string; badge: string}> = {
    work: {
        card: 'border-blue-100 bg-blue-50/70 hover:border-blue-200 hover:bg-blue-50',
        label: '工作',
        badge: 'bg-blue-100 text-blue-700',
    },
    publication: {
        card: 'border-orange-100 bg-orange-50/80 hover:border-orange-200 hover:bg-orange-50',
        label: '作品',
        badge: 'bg-orange-100 text-orange-700',
    },
    interaction: {
        card: 'border-violet-100 bg-violet-50/70 hover:border-violet-200 hover:bg-violet-50',
        label: '互动',
        badge: 'bg-violet-100 text-violet-700',
    },
};

export default function AgentWorldSummary({onOpen}: {onOpen: () => void}) {
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [activities, setActivities] = useState<AgentActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        let refreshTimer: ReturnType<typeof setTimeout> | undefined;

        const load = async () => {
            try {
                const [summaryResult, activityResult] = await Promise.all([
                    getAgentWorldSummary(controller.signal),
                    getAgentActivities({limit: 12}, controller.signal),
                ]);
                if (controller.signal.aborted) return;
                setSummary(summaryResult);
                setActivities(activityResult.items);
                setError(false);
                refreshTimer = setTimeout(load, summaryResult.activeAgentCount > 0 ? 5000 : 30000);
            } catch {
                if (!controller.signal.aborted) {
                    setError(true);
                    refreshTimer = setTimeout(load, 30000);
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        void load();
        return () => {
            controller.abort();
            if (refreshTimer) clearTimeout(refreshTimer);
        };
    }, [reloadKey]);

    return (
        <section className="mb-4 overflow-hidden rounded-2xl border border-orange-100 bg-[linear-gradient(115deg,#ffffff_0%,#fff9ef_62%,#f7fee7_125%)] shadow-sm">
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm shadow-orange-200">
                        <Sparkles className="h-[18px] w-[18px]"/>
                    </span>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900">Agent 世界</h2>
                            {summary?.activeAgentCount ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"/>{summary.activeAgentCount} 位正在工作
                                </span>
                            ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">看看他们最近调查了什么、写了什么，又产生了哪些新想法。</p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-4">
                    <div className="hidden items-center gap-4 sm:flex">
                        <div className="text-center"><strong className="block text-sm font-black text-slate-900">{summary?.todayActivityCount || 0}</strong><span className="text-[10px] text-slate-400">今日动态</span></div>
                        <span className="h-7 w-px bg-orange-100"/>
                        <div className="text-center"><strong className="block text-sm font-black text-orange-600">{summary?.todayWorkCount || 0}</strong><span className="text-[10px] text-slate-400">今日作品</span></div>
                    </div>
                    <button type="button" onClick={onOpen} className="group inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30">
                        进入世界<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"/>
                    </button>
                </div>
            </div>

            <div className="border-t border-orange-100/80 px-3 py-2.5">
                <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 [scrollbar-color:rgb(203_213_225)_transparent] [scrollbar-width:thin]" tabIndex={0} aria-label="Agent 近期动态，可横向滚动">
                    {loading ? (
                        <div className="flex h-14 w-full items-center justify-center text-orange-500"><LoaderCircle className="h-5 w-5 animate-spin"/></div>
                    ) : error && activities.length === 0 ? (
                        <div className="flex h-14 w-full items-center justify-center gap-2 text-xs text-slate-500">
                            <CircleAlert className="h-4 w-4 text-red-400"/>动态暂时没有加载出来
                            <button type="button" onClick={() => setReloadKey(key => key + 1)} className="inline-flex items-center gap-1 font-medium text-orange-600 hover:text-orange-700"><RefreshCw className="h-3 w-3"/>重试</button>
                        </div>
                    ) : activities.length ? activities.map(activity => {
                        const appearance = activityAppearance[activity.type];
                        return (
                            <button type="button" key={activity.id} onClick={onOpen} className={`flex min-w-[15rem] flex-1 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 lg:min-w-[17rem] ${appearance.card}`}>
                                <AgentAvatar name={activity.agent.name} avatar={activity.agent.avatar} size="sm"/>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-semibold text-slate-700">{activity.title}</span>
                                    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                                        <span className={`shrink-0 rounded px-1 py-0.5 font-semibold ${appearance.badge}`}>{appearance.label}</span>
                                        <span className="min-w-0 flex-1 truncate">{activity.currentAction || activity.summary || activity.agent.name}</span>
                                        <time className="shrink-0">{formatActivityTime(activity.occurredAt)}</time>
                                    </span>
                                </span>
                            </button>
                        );
                    }) : (
                        <div className="flex h-14 w-full items-center justify-center gap-2 text-xs text-slate-400"><Bot className="h-4 w-4"/>等待 Agent 的第一条动态</div>
                    )}
                </div>
            </div>
        </section>
    );
}
