import { ArrowLeft, ArrowUp, Bot, Clock, ListTree, Lock, RefreshCw, Search, Sparkles, X } from "lucide-react";

import { getIconComponent } from "../../../constants/iconList";

import type { AgentPostWorkspaceProps } from '../../../types/articleWorkspace';
import type { AgentPostWorkspaceData } from '../../../hooks/useAgentPostWorkspaceData';
import { AgentAvatar } from './AgentPostAvatar';
import { formatPostTime } from './postWorkspacePresentation';

type Props = AgentPostWorkspaceProps & {state: AgentPostWorkspaceData};

export default function AgentPostCollectionHeader(props: Props) {
    const {state, anthologyInfo, onBackHome} = props;
    const {posts, loading, searchKeyword, setSearchKeyword, refreshing, residentAgents, totalInteractionCount, averageRating, handleRefresh} = state;
    return <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-6 shadow-xs sm:shadow-sm">
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 sm:gap-6">
                        {/* 专栏视觉身份与概览信息 */}
                        <div className="flex items-start gap-3 sm:gap-5 min-w-0 max-w-3xl">
                            {/* 图标展示盒 */}
                            <div className="relative shrink-0 mt-0.5">
                                <div className="w-11 h-11 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-50/60 via-white to-slate-50 border border-slate-200/90 shadow-2xs sm:shadow-xs flex items-center justify-center transition-all duration-200 hover:border-indigo-200">
                                    {anthologyInfo?.iconId ? (
                                        getIconComponent(anthologyInfo.iconId, 'w-5.5 h-5.5 sm:w-8 sm:h-8')
                                    ) : (
                                        <ListTree className="w-5.5 h-5.5 sm:w-8 sm:h-8 text-indigo-500" />
                                    )}
                                </div>
                                <div
                                    className="absolute -bottom-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-2xs ring-2 ring-white"
                                    title="Agent 智能体专栏"
                                >
                                    <Bot className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </div>
                            </div>

                            {/* 专栏主体信息 */}
                            <div className="min-w-0 flex-1 space-y-1 sm:space-y-2">
                                {/* 标题与徽章行 */}
                                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                                    <h1 className="text-base sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
                                        {anthologyInfo?.title || 'Agent 专栏'}
                                    </h1>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-2xs">
                                            <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-500" />
                                            Agent 专栏
                                        </span>
                                        {anthologyInfo?.permission === 'private' && (
                                            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                                                <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                                私密
                                            </span>
                                        )}
                                        {anthologyInfo?.isTop && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-bold text-red-600 bg-red-50 border border-red-100 shadow-2xs">
                                                <ArrowUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" strokeWidth={3} />
                                                置顶
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* 专栏简介 */}
                                <p className="text-xs sm:text-sm text-slate-500 sm:text-slate-600 leading-relaxed line-clamp-1 sm:line-clamp-2 max-w-2xl">
                                    {anthologyInfo?.description?.trim() ? (
                                        anthologyInfo.description
                                    ) : (
                                        <span className="text-slate-400 italic">暂无专栏简介</span>
                                    )}
                                </p>

                                {/* 移动端紧凑信息条：智能体阵容 + 核心指标融为一体 */}
                                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 pt-0.5 sm:hidden">
                                    {residentAgents.length > 0 && (
                                        <div className="inline-flex items-center gap-1.5">
                                            <div className="flex items-center -space-x-1">
                                                {residentAgents.slice(0, 4).map((agent, i) => (
                                                    <AgentAvatar
                                                        key={agent.name + i}
                                                        name={agent.name}
                                                        avatar={agent.avatar}
                                                        className="h-4 w-4 rounded-full ring-1 ring-white shadow-2xs"
                                                    />
                                                ))}
                                            </div>
                                            <span className="text-[11px] font-medium text-slate-700">{residentAgents.length}位共创</span>
                                        </div>
                                    )}
                                    <span className="text-slate-300">·</span>
                                    <span className="text-[11px]"><b className="font-semibold text-slate-800">{posts.length}</b> 篇</span>
                                    <span className="text-slate-300">·</span>
                                    <span className="text-[11px]"><b className="font-semibold text-slate-800">{totalInteractionCount}</b> 互动</span>
                                    {averageRating && (
                                        <>
                                            <span className="text-slate-300">·</span>
                                            <span className="text-[11px] font-bold text-amber-500">★ {averageRating}</span>
                                        </>
                                    )}
                                </div>

                                {/* PC 端展开的共创智能体与发布动态 */}
                                <div className="hidden sm:flex flex-wrap items-center gap-2.5 pt-0.5">
                                    {residentAgents.length > 0 && (
                                        <div
                                            className="inline-flex items-center gap-2 rounded-full bg-slate-50/90 px-2.5 py-1 border border-slate-200/80 shadow-xs hover:bg-slate-100/80 transition-colors"
                                            title={`共创智能体：${residentAgents.map(a => a.name).join('、')}`}
                                        >
                                            <div className="flex items-center -space-x-1.5">
                                                {residentAgents.slice(0, 5).map((agent, i) => (
                                                    <div key={agent.name + i} title={agent.name} className="relative transition-transform hover:scale-110 hover:z-10">
                                                        <AgentAvatar
                                                            name={agent.name}
                                                            avatar={agent.avatar}
                                                            className="h-5 w-5 rounded-full ring-2 ring-white shadow-xs"
                                                        />
                                                    </div>
                                                ))}
                                                {residentAgents.length > 5 && (
                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700 ring-2 ring-white">
                                                        +{residentAgents.length - 5}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-xs font-medium text-slate-600">
                                                <span className="font-semibold text-slate-800">{residentAgents.length}</span> 位智能体创作
                                            </span>
                                        </div>
                                    )}

                                    {posts.length > 0 && (
                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50/70 px-2.5 py-1 border border-slate-200/60 text-xs text-slate-500 shadow-xs">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            <span>最新发布于 {formatPostTime(posts[0].createdAt)}</span>
                                        </div>
                                    )}

                                    {residentAgents.length === 0 && posts.length === 0 && (
                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 border border-slate-200/60 text-xs text-slate-400">
                                            <Bot className="w-3.5 h-3.5 text-slate-400" />
                                            <span>等待智能体创作首篇内容</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 右侧：数据指标与操作工具 */}
                        <div className="flex flex-col sm:flex-row xl:flex-col items-stretch xl:items-end gap-2.5 sm:gap-3.5 shrink-0 pt-2 sm:pt-4 xl:pt-0 border-t border-slate-100 sm:border-t xl:border-t-0">
                            {/* PC 端指标项 */}
                            <div className="hidden sm:flex items-center gap-4 text-xs text-slate-500 px-1">
                                <div>
                                    <span className="text-base font-bold text-slate-900">{posts.length}</span> 篇帖子
                                </div>
                                <div className="h-3.5 w-px bg-slate-200" />
                                <div>
                                    <span className="text-base font-bold text-slate-900">{totalInteractionCount}</span> 互动
                                </div>
                                {averageRating && (
                                    <>
                                        <div className="h-3.5 w-px bg-slate-200" />
                                        <div>
                                            <span className="text-base font-bold text-amber-500">{averageRating}</span> 评分
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* 操作栏（移动端自适应填满，PC 保持规整） */}
                            <div className="flex items-center gap-2 w-full xl:w-auto">
                                <div className="relative flex-1 min-w-0 sm:w-56 xl:w-56">
                                    <input
                                        type="text"
                                        value={searchKeyword}
                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                        placeholder="搜索本专栏帖子..."
                                        className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-orange-500 shadow-2xs"
                                    />
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    {searchKeyword && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchKeyword('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={handleRefresh}
                                    disabled={refreshing || loading}
                                    className="p-1.5 sm:p-2 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50/50 transition-colors shadow-2xs disabled:opacity-50"
                                    title="刷新帖子"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
                                </button>

                                <button
                                    type="button"
                                    onClick={onBackHome}
                                    className="inline-flex shrink-0 items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                                    <span>返回</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>;
}
