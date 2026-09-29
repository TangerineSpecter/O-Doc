import {lazy, Suspense, useCallback, useState} from 'react';
import WorldDialog from '../components/AgentWorld/WorldDialog';
const FarmDialog = lazy(() => import('../components/Farm/FarmDialog'));
const ItemCatalogDialog = lazy(() => import('../components/AgentWorld/ItemCatalogDialog'));
import {Activity, ArrowLeft, Bot, BookOpenText, CircleDollarSign, MessageCircle, RefreshCw, Settings, Sparkles} from 'lucide-react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import AgentTravelPanel from '../components/AgentWorld/AgentTravelPanel';
import AgentActivityCard from '../components/AgentWorld/AgentActivityCard';
import AgentAttributePanel from '../components/AgentWorld/AgentAttributePanel';
import AgentWorldBanner from '../components/AgentWorld/AgentWorldBanner';
import AgentFinanceFeed from '../components/AgentWorld/AgentFinanceFeed';
import AgentRelationCard from '../components/AgentWorld/AgentRelationCard';
import AgentRunDrawer from '../components/AgentWorld/AgentRunDrawer';
import WorldManagementDialog from '../components/AgentWorld/WorldManagementDialog';
import {AgentResidentsMobileBar, AgentResidentsSidebar} from '../components/AgentWorld/AgentResidentsBar';
import StarLoader from '../components/common/StarLoader';
import {useAgentRelation} from '../hooks/useAgentRelation';
import {useAgentWorld} from '../hooks/useAgentWorld';
import {useAgentWorldFinance} from '../hooks/useAgentWorldFinance';
import type {AgentActivity as AgentActivityData, AgentActivityType} from '../types/api/setting';

type AgentWorldFilter = AgentActivityType | 'all' | 'finance' | 'travel';

const filters: Array<{value: AgentWorldFilter; label: string; icon: typeof Activity}> = [
    {value: 'all', label: '全部', icon: Sparkles},
    {value: 'publication', label: '作品', icon: BookOpenText},
    {value: 'interaction', label: '互动', icon: MessageCircle},
    {value: 'work', label: '工作', icon: Activity},
    {value: 'travel', label: '旅行', icon: BookOpenText},
    {value: 'finance', label: '收支', icon: CircleDollarSign},
];

export default function AgentWorldPage() {
    const navigate = useNavigate();
    const [farmOpen, setFarmOpen] = useState(false);
    const closeFarm = useCallback(() => setFarmOpen(false), []);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const closeCatalog = useCallback(() => setCatalogOpen(false), []);
    const [worldManagementOpen, setWorldManagementOpen] = useState(false);
    const [query] = useSearchParams();
    const world = useAgentWorld();
    const [activeFilter, setActiveFilter] = useState<AgentWorldFilter>(query.has('travel') ? 'travel' : 'all');
    const finance = useAgentWorldFinance(world.agentId, activeFilter === 'finance');
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
        {
            label: '今日动态',
            value: world.summary?.todayActivityCount || 0,
            icon: Activity,
            color: 'text-slate-800',
            iconColor: 'text-sky-500 bg-sky-50',
            dot: false,
        },
        {
            label: '今日作品',
            value: world.summary?.todayWorkCount || 0,
            icon: BookOpenText,
            color: (world.summary?.todayWorkCount || 0) > 0 ? 'text-orange-600' : 'text-slate-800',
            iconColor: 'text-orange-500 bg-orange-50',
            dot: false,
        },
        {
            label: '正在工作',
            value: world.summary?.activeAgentCount || 0,
            icon: Bot,
            color: (world.summary?.activeAgentCount || 0) > 0 ? 'text-emerald-600' : 'text-slate-800',
            iconColor: 'text-emerald-500 bg-emerald-50',
            dot: (world.summary?.activeAgentCount || 0) > 0,
        },
    ] as const;

    return (
        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <AgentWorldBanner stats={statsData} />

            {/* 卡片下方操作栏：左侧管理入口，右侧紧跟返回文集 */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 sm:mt-3.5">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                    <span className="font-semibold text-slate-700">全域生活动态</span>
                    <span className="text-slate-300 hidden sm:inline">·</span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">实时见证智能体思考与成长轨迹</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setCatalogOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600">
                        <BookOpenText className="h-3.5 w-3.5 shrink-0"/>物品图鉴
                    </button>
                    <button type="button" onClick={() => setFarmOpen(true)} className="rounded-lg border border-lime-200 bg-lime-50 px-3 py-1.5 text-xs font-semibold text-lime-700">像素农场</button>
                    <button
                        type="button"
                        onClick={() => setWorldManagementOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-orange-300 hover:bg-orange-50/50 hover:text-orange-600 active:scale-95"
                    >
                        <Settings className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>世界管理</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs transition-colors hover:border-orange-300 hover:bg-orange-50/50 hover:text-orange-600 active:scale-95"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span>返回文集</span>
                    </button>
                </div>
            </div>

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
                                const active = activeFilter === filter.value;
                                return (
                                    <button
                                        key={filter.value}
                                        type="button"
                                        onClick={() => {
                                            setActiveFilter(filter.value);
                                            if (filter.value !== 'finance' && filter.value !== 'travel') world.setType(filter.value);
                                        }}
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
                            onClick={() => {
                                if (activeFilter === 'finance') void finance.reload();
                                else void world.reload();
                            }}
                            aria-label={activeFilter === 'finance' ? '刷新收支' : '刷新动态'}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-orange-600 sm:p-2"
                        >
                            <RefreshCw className="h-4 w-4"/>
                        </button>
                    </div>

                    {activeFilter === 'travel' ? <AgentTravelPanel agentId={world.agentId} journeyId={query.get('travel') || undefined}/> : activeFilter === 'finance' ? (
                        <AgentFinanceFeed
                            entries={finance.entries}
                            selectedAgentId={world.agentId}
                            loading={finance.loading}
                            error={finance.error}
                        />
                    ) : world.loading ? (
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
            {farmOpen&&<Suspense fallback={<WorldDialog title="像素农场" onClose={closeFarm} size="wide" manageFocus={false}><p className="p-8 text-center text-slate-500">正在铺开农场地图…</p></WorldDialog>}><FarmDialog initialAgentId={world.agentId} onClose={closeFarm}/></Suspense>}
            {catalogOpen && <Suspense fallback={<WorldDialog title="物品图鉴" onClose={closeCatalog} size="wide" manageFocus={false}><p className="p-8 text-center text-slate-500">正在翻开图鉴…</p></WorldDialog>}><ItemCatalogDialog onClose={closeCatalog}/></Suspense>}
            {worldManagementOpen && <WorldManagementDialog onClose={() => setWorldManagementOpen(false)} />}
            <AgentRunDrawer
                key={selectedActivity?.runRecordId || selectedActivity?.id || 'closed'}
                activity={selectedActivity}
                onClose={() => setSelectedActivity(null)}
            />
        </main>
    );
}
