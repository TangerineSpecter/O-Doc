import { BarChart3, Bot, Network, Settings, Sparkles, UserRound, Users } from 'lucide-react';
import type { AgentWorldAgentStatus } from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';

interface AgentResidentsProps {
    agents: AgentWorldAgentStatus[];
    selectedAgentId: string;
    onSelectAgent: (agentId: string) => void;
    onOpenRelation?: () => void;
    onOpenAttributes?: () => void;
    onOpenAnalytics?: () => void;
    onOpenManagement?: () => void;
}

/**
 * 移动端专用的横向平滑滚动居民状态条
 * 位于首屏顶部（Hero 下方、动态列表上方），让用户无需翻滚到最底端即可一眼感知 Agent 状态并直接进行筛选
 */
function ResidentActions({
    onOpenRelation,
    onOpenAttributes,
    onOpenAnalytics,
    onOpenManagement,
    compact = false,
}: Pick<AgentResidentsProps, 'onOpenRelation' | 'onOpenAttributes' | 'onOpenAnalytics' | 'onOpenManagement'> & {compact?: boolean}) {
    if (!onOpenRelation && !onOpenAttributes && !onOpenAnalytics && !onOpenManagement) return null;

    if (compact) {
        return (
            <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-slate-100/90 pt-2">
                {onOpenRelation && (
                    <button
                        type="button"
                        onClick={onOpenRelation}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-50 py-1.5 px-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-700 active:scale-95"
                    >
                        <Network className="h-3 w-3 shrink-0" />
                        <span className="truncate">关系图谱</span>
                    </button>
                )}
                {onOpenAttributes && (
                    <button
                        type="button"
                        onClick={onOpenAttributes}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-50 py-1.5 px-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-orange-50 hover:text-orange-700 active:scale-95"
                    >
                        <UserRound className="h-3 w-3 shrink-0" />
                        <span className="truncate">属性</span>
                    </button>
                )}
                {onOpenAnalytics && (
                    <button
                        type="button"
                        onClick={onOpenAnalytics}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-orange-50/80 py-1.5 px-1 text-[11px] font-medium text-orange-700 transition-colors hover:bg-orange-100 active:scale-95"
                    >
                        <BarChart3 className="h-3 w-3 shrink-0 text-orange-600" />
                        <span className="truncate">数据分析</span>
                    </button>
                )}
                {onOpenManagement && (
                    <button
                        type="button"
                        onClick={onOpenManagement}
                        className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-50 py-1.5 px-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                    >
                        <Settings className="h-3 w-3 shrink-0 text-slate-500" />
                        <span className="truncate">Agent管理</span>
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="mt-3 grid grid-cols-2 gap-2">
            {onOpenRelation && (
                <button type="button" onClick={onOpenRelation} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-200 hover:text-orange-700">
                    <Network className="h-3.5 w-3.5"/>关系图谱
                </button>
            )}
            {onOpenAttributes && (
                <button type="button" onClick={onOpenAttributes} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-orange-200 hover:text-orange-700">
                    <UserRound className="h-3.5 w-3.5"/>属性
                </button>
            )}
        </div>
    );
}

export function AgentResidentsMobileBar({
    agents,
    selectedAgentId,
    onSelectAgent,
    onOpenRelation,
    onOpenAttributes,
    onOpenAnalytics,
    onOpenManagement,
}: AgentResidentsProps) {
    const totalActivities = agents.reduce((sum, agent) => sum + (agent.todayCount || 0), 0);
    const activeAgentsCount = agents.filter(a => a.status === 'running').length;

    return (
        <section aria-label="居民状态" className="mb-3 rounded-2xl border border-orange-100/90 bg-white/95 p-3 shadow-xs">
            {/* 顶栏微标题与右上角快捷功能按钮 */}
            <div className="mb-2 flex items-center justify-between gap-1.5 px-0.5">
                <div className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Users className="h-3.5 w-3.5 shrink-0 text-orange-500" />
                    <span className="shrink-0">居民状态</span>
                    <span className="text-[11px] font-normal text-slate-400">({agents.length})</span>
                    {activeAgentsCount > 0 && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600" title={`${activeAgentsCount} 位工作中`}>
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                            <span className="hidden xs:inline">{activeAgentsCount} 正在工作</span>
                        </span>
                    )}
                </div>

                {/* 右上角快捷操作工具组 */}
                <div className="flex shrink-0 items-center gap-1">
                    {onOpenRelation && (
                        <button
                            type="button"
                            onClick={onOpenRelation}
                            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95"
                            title="关系图谱"
                        >
                            <Network className="h-3 w-3 shrink-0 text-slate-500" />
                            <span>图谱</span>
                        </button>
                    )}
                    {onOpenAttributes && (
                        <button
                            type="button"
                            onClick={onOpenAttributes}
                            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 active:scale-95"
                            title="属性"
                        >
                            <UserRound className="h-3 w-3 shrink-0 text-slate-500" />
                            <span>属性</span>
                        </button>
                    )}
                    {onOpenAnalytics && (
                        <button
                            type="button"
                            onClick={onOpenAnalytics}
                            className="inline-flex items-center gap-0.5 rounded-lg border border-orange-200/80 bg-orange-50/80 px-1.5 py-1 text-[11px] font-medium text-orange-700 transition-colors hover:bg-orange-100 active:scale-95"
                            title="居民数据分析"
                        >
                            <BarChart3 className="h-3 w-3 shrink-0 text-orange-600" />
                            <span>分析</span>
                        </button>
                    )}
                    {onOpenManagement && (
                        <button
                            type="button"
                            onClick={onOpenManagement}
                            className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-1.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                            title="Agent 管理"
                        >
                            <Settings className="h-3 w-3 shrink-0 text-slate-500" />
                            <span>管理</span>
                        </button>
                    )}
                </div>
            </div>

            {/* 横向滚动列表 */}
            <div
                className="flex items-center gap-2 overflow-x-auto overscroll-x-contain pb-0.5 pt-0.5 focus-visible:outline-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                tabIndex={0}
                aria-label="Agent 居民列表，可横向滑动"
            >
                {/* “全部居民”胶囊 */}
                <button
                    type="button"
                    onClick={() => onSelectAgent('')}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                        !selectedAgentId
                            ? 'border-orange-300 bg-orange-50/90 text-orange-700 shadow-xs ring-1 ring-orange-500/20'
                            : 'border-slate-200/80 bg-slate-50/70 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                >
                    <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-orange-100/80 text-orange-600">
                        <Sparkles className="h-3 w-3" />
                    </span>
                    <span>全部居民</span>
                    <span className="ml-0.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
                        {totalActivities}
                    </span>
                </button>

                {/* 各个 Agent 胶囊 */}
                {agents.map((agent) => {
                    const isSelected = selectedAgentId === agent.id;
                    const isRunning = agent.status === 'running';

                    return (
                        <button
                            key={agent.id}
                            type="button"
                            onClick={() => onSelectAgent(agent.id)}
                            className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs transition-all ${
                                isSelected
                                    ? 'border-orange-300 bg-orange-50/90 text-orange-700 shadow-xs ring-1 ring-orange-500/20'
                                    : 'border-slate-200/80 bg-slate-50/70 text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                            <div className="relative shrink-0">
                                <AgentAvatar name={agent.name} avatar={agent.avatar} size="xs" />
                                <span
                                    className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ${
                                        isRunning ? 'animate-pulse bg-blue-500' : 'bg-slate-300'
                                    }`}
                                />
                            </div>

                            <div className="flex flex-col text-left">
                                <span className="font-semibold text-slate-800 text-xs leading-none">
                                    {agent.name}
                                </span>
                                <span className="mt-0.5 max-w-[80px] truncate text-[10px] text-slate-400 leading-none">
                                    {agent.currentAction || agent.latestTitle || '静候灵感'}
                                </span>
                            </div>

                            <span className="ml-0.5 rounded-full bg-slate-200/80 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium">
                                {agent.todayCount}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}

/**
 * 桌面端保留的右侧吸顶侧边栏（>= lg）
 */
export function AgentResidentsSidebar({
    agents,
    selectedAgentId,
    onSelectAgent,
    onOpenRelation,
    onOpenAttributes,
}: AgentResidentsProps) {
    return (
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-orange-500" />
                    <h2 className="text-sm font-bold text-slate-900">居民状态</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    {agents.length} 位 Agent
                </span>
            </div>

            <button
                type="button"
                onClick={() => onSelectAgent('')}
                className={`mt-3 w-full rounded-xl px-3 py-2 text-left text-xs font-semibold transition-colors ${
                    !selectedAgentId
                        ? 'border border-orange-200 bg-orange-50 text-orange-700 shadow-xs'
                        : 'text-slate-600 hover:bg-slate-50'
                }`}
            >
                查看所有 Agent
            </button>

            <div className="mt-2 max-h-[310px] space-y-1 overflow-y-auto overscroll-contain pr-0.5 scrollbar-hide">
                {agents.map((agent) => (
                    <button
                        key={agent.id}
                        type="button"
                        onClick={() => onSelectAgent(agent.id)}
                        className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                            selectedAgentId === agent.id
                                ? 'border border-orange-200 bg-orange-50/90 text-orange-700'
                                : 'border border-transparent hover:bg-slate-50'
                        }`}
                    >
                        <AgentAvatar name={agent.name} avatar={agent.avatar} size="sm" />
                        <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                {agent.name}
                                <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                        agent.status === 'running' ? 'animate-pulse bg-blue-500' : 'bg-slate-300'
                                    }`}
                                />
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                {agent.currentAction || agent.latestTitle || '今天还没有动态'}
                            </span>
                        </span>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                            {agent.todayCount}
                        </span>
                    </button>
                ))}
            </div>
            <ResidentActions onOpenRelation={onOpenRelation} onOpenAttributes={onOpenAttributes}/>
        </aside>
    );
}
