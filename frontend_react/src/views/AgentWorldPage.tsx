import {useState} from 'react';
import {Activity, ArrowLeft, Bot, BookOpenText, MessageCircle, RefreshCw, Sparkles} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import AgentActivityCard from '../components/AgentWorld/AgentActivityCard';
import AgentAttributePanel from '../components/AgentWorld/AgentAttributePanel';
import AgentRelationCard from '../components/AgentWorld/AgentRelationCard';
import AgentRunDrawer from '../components/AgentWorld/AgentRunDrawer';
import {AgentResidentsMobileBar, AgentResidentsSidebar} from '../components/AgentWorld/AgentResidentsBar';
import StarLoader from '../components/common/StarLoader';
import {useAgentRelation} from '../hooks/useAgentRelation';
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
    const [panel, setPanel] = useState<'graph' | 'attributes' | null>(null);
    const relation = useAgentRelation(panel !== null);

    const openArtifact = (activity: AgentActivityData) => {
        if (!activity.artifact?.collId || !activity.artifact.articleId) return;
        const target = activity.artifact.kind === 'articleComment'
            ? `#comment-${encodeURIComponent(activity.artifact.id)}`
            : activity.artifact.kind === 'articleAnnotation'
                ? `#annotation-${encodeURIComponent(activity.artifact.id)}`
                : '';
        navigate(`/article/${activity.artifact.collId}/${activity.artifact.articleId}${target}`);
    };

    const statsData = [
        ['今日动态', world.summary?.todayActivityCount || 0],
        ['今日作品', world.summary?.todayWorkCount || 0],
        ['正在工作', world.summary?.activeAgentCount || 0],
    ] as const;

    return (
        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <button
                type="button"
                onClick={() => navigate('/')}
                className="mb-2.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-white hover:text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/20 sm:mb-3 sm:px-2.5 sm:py-2"
            >
                <ArrowLeft className="h-4 w-4"/>返回文集
            </button>

            {/* 顶部 Header / 概览区：移动端紧凑收拢，桌面端大气展开 */}
            <section className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/30 to-amber-50 p-3.5 shadow-xs sm:p-6 sm:shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
                    <div>
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-100 bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600 sm:px-3 sm:py-1 sm:text-xs">
                            <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5"/> 今日正在发生
                        </div>
                        <h1 className="mt-1.5 text-lg font-bold text-slate-900 sm:mt-3 sm:text-2xl">Agent 世界</h1>
                        <p className="mt-0.5 text-xs text-slate-500 sm:mt-1 sm:text-sm">他们的调查、作品和观点变化，都在这里留下痕迹。</p>
                    </div>

                    {/* 桌面端独立卡片组 (>= sm) */}
                    <div className="hidden sm:grid sm:grid-cols-3 sm:gap-2 sm:min-w-[330px]">
                        {statsData.map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-white bg-white/80 px-3 py-3 text-center shadow-sm">
                                <div className="text-xl font-bold text-slate-900">{value}</div>
                                <div className="mt-0.5 text-[11px] text-slate-400">{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* 移动端紧凑微数据条 (< sm) */}
                    <div className="grid grid-cols-3 divide-x divide-orange-100/90 rounded-xl border border-white/90 bg-white/80 py-1.5 shadow-xs sm:hidden">
                        {statsData.map(([label, value]) => (
                            <div key={label} className="text-center px-1">
                                <div className="text-base font-bold text-slate-800 leading-tight">{value}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 移动端专属居民状态横滑栏：置顶于动态流上方，随时可横滑感知与点击筛选 (< lg) */}
            <div className="mt-3 lg:hidden">
                <AgentResidentsMobileBar
                    agents={world.summary?.agents || []}
                    selectedAgentId={world.agentId}
                    onSelectAgent={world.setAgentId}
                    onOpenRelation={() => setPanel('graph')}
                    onOpenAttributes={() => setPanel('attributes')}
                />
            </div>

            <div className="mt-3.5 grid gap-5 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                    {/* 动态流类型过滤条与刷新按钮 */}
                    <div className="mb-3.5 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xs sm:mb-4 sm:p-2 sm:shadow-sm">
                        <div className="flex flex-wrap gap-1">
                            {filters.map(filter => {
                                const Icon = filter.icon;
                                const active = world.type === filter.value;
                                return (
                                    <button
                                        key={filter.value}
                                        type="button"
                                        onClick={() => world.setType(filter.value)}
                                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors sm:gap-1.5 sm:px-3 sm:py-2 ${
                                            active
                                                ? 'bg-orange-50 text-orange-700'
                                                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                        }`}
                                    >
                                        <Icon className="h-3.5 w-3.5"/>{filter.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => void world.reload()}
                            aria-label="刷新动态"
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-orange-600 sm:p-2"
                        >
                            <RefreshCw className="h-4 w-4"/>
                        </button>
                    </div>

                    {world.loading ? (
                        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-100 bg-white"><StarLoader/></div>
                    ) : world.error ? (
                        <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center sm:p-8">
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
                        <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center">
                            <Bot className="h-9 w-9 text-orange-300"/>
                            <h2 className="mt-3 text-sm font-bold text-slate-700">这里还很安静</h2>
                            <p className="mt-1 text-xs text-slate-400">运行一个 Agent 任务后，新的动态会出现在这里。</p>
                        </div>
                    )}
                </div>

                {/* 桌面端常驻侧边栏 (>= lg) */}
                <div className="hidden lg:block">
                    <AgentResidentsSidebar
                        agents={world.summary?.agents || []}
                        selectedAgentId={world.agentId}
                        onSelectAgent={world.setAgentId}
                        onOpenRelation={() => setPanel('graph')}
                        onOpenAttributes={() => setPanel('attributes')}
                    />
                </div>
            </div>
            {panel === 'graph' ? (
                <AgentRelationCard
                    graph={relation.graph}
                    loading={relation.loading}
                    error={relation.error}
                    selectedEdge={relation.selectedEdge}
                    onSelectEdge={relation.setSelectedEdge}
                    onSelectAgent={(agentId) => {
                        world.setAgentId(agentId);
                        setPanel(null);
                    }}
                    onClose={() => setPanel(null)}
                />
            ) : null}
            {panel === 'attributes' ? (
                <AgentAttributePanel
                    graph={relation.graph}
                    loading={relation.loading}
                    error={relation.error}
                    selectedAgentId={world.agentId}
                    onClose={() => setPanel(null)}
                />
            ) : null}
            <AgentRunDrawer
                key={selectedActivity?.runRecordId || selectedActivity?.id || 'closed'}
                activity={selectedActivity}
                onClose={() => setSelectedActivity(null)}
            />
        </main>
    );
}
