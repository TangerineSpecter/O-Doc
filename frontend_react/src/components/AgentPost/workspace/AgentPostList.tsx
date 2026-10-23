import { CategoryMigration, MigrationAlert } from "../../AgentWorld/CategoryMigration";

import { PostRanking } from "../../AgentWorld/PostRanking";
import { LatestCommentsCard } from "../../AgentWorld/LatestCommentsCard";

import { AlertCircle, Bot, Search, X } from "lucide-react";

import ConfirmationModal from "../../common/ConfirmationModal";

import StarLoader from "../../common/StarLoader";

import type { AgentPostWorkspaceProps } from '../../../types/articleWorkspace';
import type { AgentPostWorkspaceData } from '../../../hooks/useAgentPostWorkspaceData';

import AgentPostCollectionHeader from './AgentPostCollectionHeader';
import AgentPostCard from './AgentPostCard';
type Props = AgentPostWorkspaceProps & {state: AgentPostWorkspaceData};

export default function AgentPostList(props: Props) {
    const {state, collId, onNavigate, canManage} = props;
    const {canMigrate, posts, loading, deleteTarget, setDeleteTarget, activeCategory, setActiveCategory, searchKeyword, setSearchKeyword, isLoadingMore, sentinelRef, migrationTarget, setMigrationTarget, latestComments, categoryStats, filteredPosts, visiblePosts, hasMore, loadPosts, confirmDeletePost} = state;
    return (
        <div className="min-h-[calc(100vh-64px)] bg-[#f8fbff]">
            {canManage && (
                <ConfirmationModal
                    isOpen={!!deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDeletePost}
                    title="删除 Agent 帖子"
                    description="删除后将移入回收站，可从回收站恢复。"
                    confirmText="移入回收站"
                    type="danger"
                />
            )}
            <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
                {/* 精致紧凑排版 Header（移动端紧凑自适应，PC 端大屏舒展） */}
                <AgentPostCollectionHeader {...props} state={state} />

                {migrationTarget && <CategoryMigration collectionId={collId || ''} {...migrationTarget} onClose={() => setMigrationTarget(undefined)} onComplete={() => { setActiveCategory('all'); void loadPosts(); }}/>}
                {categoryStats.some(category => category.pending) && (
                    <div className="mb-4 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/80 px-4 py-2.5 text-xs text-orange-800">
                        <AlertCircle className="h-4 w-4 shrink-0 text-orange-600" />
                        <span className="flex-1">
                            历史帖子分类尚未关联当前分类管理列表。{canMigrate ? '点击分类旁的感叹号批量迁移，或帖子右侧的感叹号迁移单篇。' : '请由文集管理者手动迁移帖子分类。'}
                        </span>
                    </div>
                )}
                {/* 胶囊分类筛选器 */}
                <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        <button
                            type="button"
                            onClick={() => setActiveCategory('all')}
                            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                                activeCategory === 'all'
                                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/25'
                                    : 'border border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-600 shadow-xs'
                            }`}
                        >
                            全部 {posts.length}
                        </button>
                        {categoryStats.map(category => (
                            <div
                                key={category.key}
                                className={`flex shrink-0 items-center rounded-full border transition-all ${
                                    activeCategory === category.key
                                        ? 'border-orange-500 bg-orange-500 text-white shadow-sm shadow-orange-500/25'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-600 shadow-xs'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => setActiveCategory(category.key)}
                                    className={`px-3.5 py-1.5 text-xs font-medium ${activeCategory === category.key ? 'text-white font-semibold' : 'text-slate-600'}`}
                                >
                                    {category.name} {category.count}
                                </button>
                                {canMigrate && category.pending && (
                                    <span className="pr-2">
                                        <MigrationAlert onClick={() => setMigrationTarget({oldCategory: category.oldCategory})} />
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                    {searchKeyword && (
                        <div className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
                            找到 <span className="font-semibold text-orange-600">{filteredPosts.length}</span> 条结果
                        </div>
                    )}
                </div>

                {loading ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-100 bg-white">
                        <StarLoader />
                        <span className="mt-2 text-xs font-medium text-slate-400">正在加载 Agent 帖子...</span>
                    </div>
                ) : visiblePosts.length > 0 ? (
                    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px] min-[1900px]:relative min-[1900px]:block">
                        <div className="min-w-0 flex-1 space-y-6">
                            <div className="grid grid-cols-1 content-start auto-rows-max gap-5 md:grid-cols-2 2xl:grid-cols-3 min-[1900px]:mx-auto min-[1900px]:max-w-[1120px]">
                                {visiblePosts.map(post => (
                                    <AgentPostCard key={post.articleId} post={post} collId={collId} onNavigate={onNavigate} canManage={canManage} canMigrate={canMigrate} setMigrationTarget={setMigrationTarget} setDeleteTarget={setDeleteTarget} />
                                ))}
                            </div>

                            {/* 底部滚动加载指示器与触底标识 */}
                            <div ref={sentinelRef} className="flex justify-center py-6 min-[1900px]:mx-auto min-[1900px]:max-w-[1120px]">
                                {isLoadingMore ? (
                                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs text-slate-600">
                                        <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                        <span>正在加载更多帖子...</span>
                                    </div>
                                ) : hasMore ? (
                                    <span className="text-xs text-slate-400 font-medium">向下滚动加载更多</span>
                                ) : filteredPosts.length > 0 ? (
                                    <div className="text-xs text-slate-400 font-medium bg-slate-100/60 px-4 py-1.5 rounded-full">
                                        — 已经到底了，共 {filteredPosts.length} 篇帖子 —
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <aside className="space-y-5 min-[1900px]:absolute min-[1900px]:left-[calc(50%+584px)] min-[1900px]:top-0 min-[1900px]:w-[360px]">
                            <PostRanking collectionId={collId || ''} refreshKey={posts} onOpen={articleId => onNavigate?.('article', {collId, articleId})}/>
                            <LatestCommentsCard
                                comments={latestComments}
                                onOpenPost={articleId => onNavigate?.('article', {collId, articleId})}
                            />
                        </aside>
                    </div>
                ) : searchKeyword.trim() ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400">
                        <Search className="h-8 w-8 text-slate-300 mb-2" />
                        <p className="text-sm font-medium text-slate-600">未找到与 “{searchKeyword}” 相关的帖子</p>
                        <p className="mt-1 text-xs text-slate-400">可以尝试更换关键词或清除搜索条件</p>
                        <button
                            type="button"
                            onClick={() => setSearchKeyword('')}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                        >
                            <X className="h-3.5 w-3.5" />
                            清除搜索
                        </button>
                    </div>
                ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-indigo-300 bg-white text-slate-400">
                        <Bot className="h-8 w-8 text-indigo-500" />
                        <p className="mt-3 text-sm">暂无 Agent 帖子</p>
                    </div>
                )}
            </main>
        </div>
    );
}
