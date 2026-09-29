import {lazy, Suspense, useCallback, useEffect, useState} from 'react';
import WorldDialog from '../components/AgentWorld/WorldDialog';
const LifeScheduleDialog = lazy(() => import('../components/AgentLife/LifeScheduleDialog'));
const MarketDialog = lazy(() => import('../components/Market/MarketDialog'));
const FarmDialog = lazy(() => import('../components/Farm/FarmDialog'));
const ItemCatalogDialog = lazy(() => import('../components/AgentWorld/ItemCatalogDialog'));
import {Activity, ArrowLeft, Bot, BookOpenText, Settings, Store} from 'lucide-react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import DailyFeedTimeline from '../components/AgentWorld/DailyFeedTimeline';
import AgentAttributePanel from '../components/AgentWorld/AgentAttributePanel';
import AgentWorldBanner from '../components/AgentWorld/AgentWorldBanner';
import AgentRelationCard from '../components/AgentWorld/AgentRelationCard';
import AgentRunDrawer from '../components/AgentWorld/AgentRunDrawer';
import WorldManagementDialog from '../components/AgentWorld/WorldManagementDialog';
import {AgentResidentsMobileBar, AgentResidentsSidebar} from '../components/AgentWorld/AgentResidentsBar';
import {useAgentRelation} from '../hooks/useAgentRelation';
import {useAgentWorld} from '../hooks/useAgentWorld';
import type {DailyFeedEvent} from '../types/api/dailyFeed';
import type {AgentActivity as AgentActivityData, AgentActivityType} from '../types/api/setting';

const InvestmentDialog = lazy(() => import('../components/Investment/InvestmentDialog'));
const TravelJourneyDialog = lazy(() => import('../components/AgentWorld/TravelJourneyDialog'));

export default function AgentWorldPage() {
    const navigate = useNavigate();
    const [lifeOpen, setLifeOpen] = useState(false);
    const [travelArchiveId, setTravelArchiveId] = useState('');
    const [feedRefreshToken, setFeedRefreshToken] = useState(0);
    const closeLife = useCallback(() => setLifeOpen(false), []);
    const [investmentOpen, setInvestmentOpen] = useState(false);
    const closeInvestment = useCallback(() => setInvestmentOpen(false), []);
    const [marketOpen, setMarketOpen] = useState(false);
    const closeMarket = useCallback(() => setMarketOpen(false), []);
    const [farmOpen, setFarmOpen] = useState(false);
    const closeFarm = useCallback(() => setFarmOpen(false), []);
    const [catalogOpen, setCatalogOpen] = useState(false);
    const closeCatalog = useCallback(() => setCatalogOpen(false), []);
    const [worldManagementOpen, setWorldManagementOpen] = useState(false);
    const [query, setQuery] = useSearchParams();
    const travelQuery = query.get('travel');
    useEffect(() => {
        setTravelArchiveId(travelQuery || '');
    }, [travelQuery]);
    const closeTravel = () => {
        setTravelArchiveId('');
        if (travelQuery) {
            const next = new URLSearchParams(query);
            next.delete('travel');
            setQuery(next, {replace: true});
        }
    };
    const world = useAgentWorld();
    const [dailySummary, setDailySummary] = useState<{date: string; total: number; actorCounts: Record<string, number>} | null>(null);
    const updateDailySummary = useCallback((value: {date: string; total: number; actorCounts: Record<string, number>}) => setDailySummary(value), []);
    const [selectedActivity, setSelectedActivity] = useState<AgentActivityData | null>(null);
    const [panel, setPanel] = useState<'graph' | 'attributes' | null>(null);
    const relation = useAgentRelation(panel !== null);

    const openDailyTarget = (event: DailyFeedEvent) => {
        const target = event.target;
        if (!target) return;
        if (target.kind === 'activity' && target.collId && target.articleId) {
            const anchor = target.artifactKind === 'articleComment' ? `#comment-${encodeURIComponent(target.artifactId || '')}` : target.artifactKind === 'articleAnnotation' ? `#annotation-${encodeURIComponent(target.artifactId || '')}` : '';
            navigate(`/article/${target.collId}/${target.articleId}${anchor}`);
        } else if ((target.kind === 'activity' || target.kind === 'run') && (target.runRecordId || target.kind === 'run')) {
            setSelectedActivity({id: event.id, type: 'work' as AgentActivityType, status: event.status as AgentActivityData['status'], agent: {id: event.actorId, name: event.actorName, avatar: ''}, title: event.title, summary: event.detail, occurredAt: event.occurredAt, runRecordId: target.runRecordId || target.id});
        } else if (target.kind === 'travel') setTravelArchiveId(target.id);
        else if (target.kind === 'farm') setFarmOpen(true);
        else if (target.kind === 'market') setMarketOpen(true);
        else if (target.kind === 'investment') setInvestmentOpen(true);
        else if (target.kind === 'life') setLifeOpen(true);
    };

    const residents = (world.summary?.agents || []).map(agent => ({...agent, todayCount: dailySummary?.actorCounts[agent.id] ?? agent.todayCount}));

    const statsData = [
        {
            label: '今日动态',
            value: dailySummary?.total ?? world.summary?.todayActivityCount ?? 0,
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
                    <button type="button" onClick={() => setLifeOpen(true)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100">生活日程</button>
                    <button type="button" onClick={() => setInvestmentOpen(true)} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700">股票投资</button>
                    <button type="button" onClick={() => setMarketOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><Store className="h-3.5 w-3.5 shrink-0"/>世界市场</button>
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

            {lifeOpen && <Suspense fallback={null}><LifeScheduleDialog onClose={closeLife}/></Suspense>}

            {/* 移动端专属居民状态横滑栏：置顶于动态流上方，随时可横滑感知与点击筛选 (< lg) */}
            <div className="mt-3 lg:hidden">
                <AgentResidentsMobileBar
                    agents={residents}
                    selectedAgentId={world.agentId}
                    onSelectAgent={world.setAgentId}
                    onOpenRelation={() => setPanel('graph')}
                    onOpenAttributes={() => setPanel('attributes')}
                />
            </div>

            <div className="mt-3.5 grid gap-5 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                    <DailyFeedTimeline actorId={world.agentId} residents={residents} onOpen={openDailyTarget} onSummary={updateDailySummary} refreshToken={feedRefreshToken}/>
                </div>

                {/* 桌面端常驻侧边栏 (>= lg) */}
                <div className="hidden lg:block">
                    <AgentResidentsSidebar
                        agents={residents}
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
            {investmentOpen && <Suspense fallback={<WorldDialog title="股票投资" onClose={closeInvestment} size="wide"><p className="p-8 text-center text-slate-500">正在打开投资账户…</p></WorldDialog>}><InvestmentDialog onClose={closeInvestment}/></Suspense>}
            {travelArchiveId && <Suspense fallback={<WorldDialog title="旅行详情" onClose={closeTravel} manageFocus={false}><p className="p-8 text-center text-slate-500">正在打开旅行详情…</p></WorldDialog>}><TravelJourneyDialog key={travelArchiveId} journeyId={travelArchiveId} onClose={closeTravel} onChanged={() => setFeedRefreshToken(value => value + 1)}/></Suspense>}
            {marketOpen && <Suspense fallback={<WorldDialog title="世界市场" onClose={closeMarket} size="wide"><p className="p-8 text-center text-slate-500">正在打开市场…</p></WorldDialog>}><MarketDialog onClose={closeMarket} residents={world.summary?.agents || []}/></Suspense>}
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
