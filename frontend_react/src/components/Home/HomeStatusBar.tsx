import { useEffect, useState } from 'react';
import { ArrowRight, Bot, CheckCircle2, HeartPulse, Sunrise } from 'lucide-react';
import { getAgentActivities, getAgentWorldSummary } from '../../api/setting';
import { getMaintenanceOverview } from '../../api/maintenance';
import type { AgentActivity, AgentWorldSummary as SummaryData } from '../../types/api/setting';
import type { MaintenanceOverview } from '../../types/api/maintenance';
import AgentAvatar from '../AgentWorld/AgentAvatar';

interface HomeStatusBarProps {
    onNavigate: (viewName: string, params?: any) => void;
}

const formatActivityTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

export default function HomeStatusBar({ onNavigate }: HomeStatusBarProps) {
    const [agentSummary, setAgentSummary] = useState<SummaryData | null>(null);
    const [activities, setActivities] = useState<AgentActivity[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [maintenance, setMaintenance] = useState<MaintenanceOverview | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const controller = new AbortController();
        let active = true;

        const fetchData = async () => {
            try {
                const [agentSumRes, agentActRes, maintRes] = await Promise.allSettled([
                    getAgentWorldSummary(controller.signal),
                    getAgentActivities({ limit: 8 }, controller.signal),
                    getMaintenanceOverview(),
                ]);

                if (!active || controller.signal.aborted) return;

                if (agentSumRes.status === 'fulfilled') {
                    setAgentSummary(agentSumRes.value);
                }
                if (agentActRes.status === 'fulfilled' && agentActRes.value.items?.length > 0) {
                    setActivities(agentActRes.value.items);
                }
                if (maintRes.status === 'fulfilled') {
                    setMaintenance(maintRes.value);
                }
            } catch {
                // 忽略非关键错误，保持静默降级
            } finally {
                if (active && !controller.signal.aborted) {
                    setLoading(false);
                }
            }
        };

        void fetchData();

        return () => {
            active = false;
            controller.abort();
        };
    }, []);

    // 动态滚动定时器（鼠标悬停时自动暂停）
    useEffect(() => {
        if (activities.length <= 1 || isPaused) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % activities.length);
        }, 3200);

        return () => clearInterval(timer);
    }, [activities.length, isPaused]);

    // 加载中骨架条
    if (loading) {
        return (
            <div className="mb-4 h-11 w-full animate-pulse rounded-xl border border-slate-200/80 bg-white shadow-sm flex items-center px-4 justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-4 w-20 rounded bg-slate-100" />
                    <div className="h-4 w-44 rounded bg-slate-100 hidden sm:block" />
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-4 w-24 rounded bg-slate-100" />
                    <div className="h-6 w-14 rounded-lg bg-slate-100" />
                </div>
            </div>
        );
    }

    const reviewHandled = maintenance?.review.handled ?? 0;
    const reviewTotal = maintenance?.review.total ?? 0;
    const healthScore = maintenance?.health.score;
    const activeCount = agentSummary?.activeAgentCount ?? 0;

    return (
        <section
            aria-label="今日状态感知"
            className="mb-4 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 shadow-sm transition hover:border-orange-200"
        >
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                {/* 左侧：Agent 实时动态滚动感知 */}
                <div
                    className="flex min-w-0 flex-1 items-center gap-2.5"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    <button
                        type="button"
                        onClick={() => onNavigate('agentWorld')}
                        className="group flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none"
                        title="查看 Agent 世界"
                    >
                        {/* 方案3风格动态闪烁圆点徽标 */}
                        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200/80 bg-orange-50/90 px-2.5 py-0.5 text-[11px] font-bold text-orange-700 transition group-hover:border-orange-300 group-hover:bg-orange-100/80">
                            <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-500 opacity-75" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-orange-500" />
                            </span>
                            <span>{activeCount > 0 ? `${activeCount}位Agent` : 'Agent动态'}</span>
                        </span>

                        {/* 垂直平滑滚动动态流 */}
                        <div className="relative h-5 min-w-0 flex-1 overflow-hidden">
                            {activities.length > 0 ? (
                                <div
                                    className="transition-transform duration-500 ease-out"
                                    style={{ transform: `translateY(-${currentIndex * 20}px)` }}
                                >
                                    {activities.map((activity) => (
                                        <div
                                            key={activity.id}
                                            className="flex h-5 items-center gap-1.5 truncate text-xs text-slate-600 transition group-hover:text-slate-900"
                                        >
                                            <AgentAvatar
                                                name={activity.agent.name}
                                                avatar={activity.agent.avatar}
                                                size="xs"
                                            />
                                            <strong className="shrink-0 font-semibold text-slate-800">
                                                {activity.agent.name}
                                            </strong>
                                            <span className="text-slate-300">·</span>
                                            <span className="truncate text-slate-600">{activity.title}</span>
                                            {activity.occurredAt && (
                                                <time className="shrink-0 text-[10px] text-slate-400 hidden md:inline">
                                                    {formatActivityTime(activity.occurredAt)}
                                                </time>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex h-5 items-center gap-1 text-xs text-slate-400">
                                    <Bot className="h-3 w-3" /> 暂无新动态
                                </div>
                            )}
                        </div>

                        <span className="shrink-0 text-xs font-semibold text-orange-600 opacity-80 transition group-hover:opacity-100 flex items-center ml-1">
                            进入世界<ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                        </span>
                    </button>
                </div>

                {/* 分隔线 */}
                <div className="hidden h-3.5 w-px bg-slate-200 sm:block" />

                {/* 右侧：今日知识回顾感知 */}
                <div className="flex shrink-0 items-center justify-between sm:justify-end gap-3 pt-1 border-t border-slate-100 sm:pt-0 sm:border-t-0">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 font-semibold text-slate-500 text-[11px]">
                            <Sunrise className="h-3.5 w-3.5 text-orange-500" />
                            今日回顾
                        </span>

                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                            <span>{reviewHandled}</span>
                            <span className="text-slate-400">/</span>
                            <span>{reviewTotal}</span>
                        </span>

                        {healthScore !== undefined && (
                            <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-slate-400">
                                <HeartPulse className="h-3 w-3 text-orange-400" />
                                <span>健康</span>
                                <strong className="font-bold text-slate-700">{healthScore}</strong>
                                <span>分</span>
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => onNavigate('maintenance')}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 active:scale-95"
                    >
                        去整理
                        <ArrowRight className="h-3 w-3" />
                    </button>
                </div>
            </div>
        </section>
    );
}
