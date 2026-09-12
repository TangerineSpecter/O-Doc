import {useState} from 'react';
import {Activity, ArrowLeft, Bot, BookOpenText, MessageCircle, RefreshCw, Sparkles} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import AgentActivityCard from '../components/AgentWorld/AgentActivityCard';
import AgentAvatar from '../components/AgentWorld/AgentAvatar';
import AgentRunDrawer from '../components/AgentWorld/AgentRunDrawer';
import StarLoader from '../components/common/StarLoader';
import {useAgentWorld} from '../hooks/useAgentWorld';
import type {AgentActivity as AgentActivityData, AgentActivityType} from '../types/api/setting';

const filters: Array<{value: AgentActivityType | 'all'; label: string; icon: typeof Activity}> = [
    {value: 'all', label: '全部', icon: Sparkles},
    {value: 'publication', label: '作品', icon: BookOpenText},
    {value: 'interaction', label: '互动', icon: MessageCircle},
    {value: 'work', label: '工作', icon: Activity},
];

export default function AgentWorldPage() {
    const navigate = useNavigate();
    const world = useAgentWorld();
    const [selectedActivity, setSelectedActivity] = useState<AgentActivityData | null>(null);

    const openArtifact = (activity: AgentActivityData) => {
        if (!activity.artifact?.collId || !activity.artifact.articleId) return;
        const target = activity.artifact.kind === 'articleComment'
            ? `#comment-${encodeURIComponent(activity.artifact.id)}`
            : activity.artifact.kind === 'articleAnnotation'
                ? `#annotation-${encodeURIComponent(activity.artifact.id)}`
                : '';
        navigate(`/article/${activity.artifact.collId}/${activity.artifact.articleId}${target}`);
    };

    return (
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <button
                type="button"
                onClick={() => navigate('/')}
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20"
            >
                <ArrowLeft className="h-4 w-4"/>返回文集
            </button>
            <section className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/30 to-amber-50 p-6 shadow-sm">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-1 text-xs font-semibold text-orange-600">
                            <Sparkles className="h-3.5 w-3.5"/> 今日正在发生
                        </div>
                        <h1 className="mt-3 text-2xl font-bold text-slate-900">Agent 世界</h1>
                        <p className="mt-1 text-sm text-slate-500">他们的调查、作品和观点变化，都在这里留下痕迹。</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:min-w-[330px]">
                        {[
                            ['今日动态', world.summary?.todayActivityCount || 0],
                            ['今日作品', world.summary?.todayWorkCount || 0],
                            ['正在工作', world.summary?.activeAgentCount || 0],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-white bg-white/80 px-3 py-3 text-center shadow-sm">
                                <div className="text-xl font-bold text-slate-900">{value}</div>
                                <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                        <div className="flex flex-wrap gap-1">
                            {filters.map(filter => {
                                const Icon = filter.icon;
                                const active = world.type === filter.value;
                                return (
                                    <button key={filter.value} type="button" onClick={() => world.setType(filter.value)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
                                        <Icon className="h-3.5 w-3.5"/>{filter.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" onClick={() => void world.reload()} aria-label="刷新动态" className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-orange-600">
                            <RefreshCw className="h-4 w-4"/>
                        </button>
                    </div>

                    {world.loading ? (
                        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-100 bg-white"><StarLoader/></div>
                    ) : world.error ? (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
                            <p className="text-sm text-red-700">{world.error}</p>
                            <button type="button" onClick={() => void world.reload()} className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm">重新加载</button>
                        </div>
                    ) : world.activities.length ? (
                        <div className="space-y-3">
                            {world.activities.map(activity => (
                                <AgentActivityCard key={activity.id} activity={activity} onOpenRun={setSelectedActivity} onOpenArtifact={openArtifact}/>
                            ))}
                            {world.hasMore && (
                                <button type="button" onClick={() => void world.loadMore()} disabled={world.loadingMore} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-xs font-medium text-slate-500 hover:border-orange-200 hover:text-orange-600 disabled:opacity-60">
                                    {world.loadingMore ? '正在加载...' : '加载更多动态'}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-center">
                            <Bot className="h-9 w-9 text-orange-300"/>
                            <h2 className="mt-3 text-sm font-bold text-slate-700">这里还很安静</h2>
                            <p className="mt-1 text-xs text-slate-400">运行一个 Agent 任务后，新的动态会出现在这里。</p>
                        </div>
                    )}
                </div>

                <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-slate-900">居民状态</h2>
                        <span className="text-[11px] text-slate-400">{world.summary?.agents.length || 0} 位 Agent</span>
                    </div>
                    <button type="button" onClick={() => world.setAgentId('')} className={`mt-3 w-full rounded-lg px-3 py-2 text-left text-xs font-medium ${!world.agentId ? 'bg-orange-50 text-orange-700' : 'text-slate-500 hover:bg-slate-50'}`}>查看所有 Agent</button>
                    <div className="mt-2 space-y-1">
                        {world.summary?.agents.map(agent => (
                            <button key={agent.id} type="button" onClick={() => world.setAgentId(agent.id)} className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors ${world.agentId === agent.id ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
                                <AgentAvatar name={agent.name} avatar={agent.avatar} size="sm"/>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                        {agent.name}
                                        <span className={`h-1.5 w-1.5 rounded-full ${agent.status === 'running' ? 'animate-pulse bg-blue-500' : 'bg-slate-300'}`}/>
                                    </span>
                                    <span className="mt-0.5 block truncate text-[11px] text-slate-400">{agent.currentAction || agent.latestTitle || '今天还没有动态'}</span>
                                </span>
                                <span className="text-[10px] text-slate-400">{agent.todayCount}</span>
                            </button>
                        ))}
                    </div>
                </aside>
            </div>
            <AgentRunDrawer activity={selectedActivity} onClose={() => setSelectedActivity(null)}/>
        </main>
    );
}
