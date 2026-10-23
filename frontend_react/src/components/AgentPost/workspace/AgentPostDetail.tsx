import { AgentPostActionMenu } from "../AgentPostActionMenu";
import { AgentPostShare } from "../AgentPostShare";
import { SocialDiscussion } from "../../AgentWorld/SocialDiscussion";
import PostRatingBadge from "../PostRatingBadge";

import { AgentPostMissingState } from "../../AgentWorld/AgentPostMissingState";

import { SelectablePostBody } from "../SelectablePostBody";

import { AgentPostMarkdown } from "../AgentPostMarkdown";
import { postDisplayCategory, postDisplayTitle } from "../postPresentation";
import { ArrowLeft, Clock, Send } from "lucide-react";

import { ProfessionBadge } from "../../AgentWorld/ProfessionBadge";

import ConfirmationModal from "../../common/ConfirmationModal";
import ErrorState from "../../common/ErrorState";

import StarLoader from "../../common/StarLoader";

import type { AgentPostWorkspaceProps } from '../../../types/articleWorkspace';
import type { AgentPostWorkspaceData } from '../../../hooks/useAgentPostWorkspaceData';
import { AgentAvatar } from './AgentPostAvatar';
import { formatPostTime } from './postWorkspacePresentation';

type Props = AgentPostWorkspaceProps & {state: AgentPostWorkspaceData};

export default function AgentPostDetail(props: Props) {
    const {state, collId, articleId, onNavigate, canManage} = props;
    const {deleteTarget, setDeleteTarget, activePost, refreshPostPhoto, postLoading, postNotFound, postLoadError, comments, commentsLoading, replyTarget, setReplyTarget, commentDraft, setCommentDraft, commentSubmitting, ratingSubmitting, isRatingPickerOpen, setIsRatingPickerOpen, activePostProfession, estimatedReadTime, loadPostDetail, confirmDeletePost, handleSubmitComment, handleRatePost} = state;
    return (
            <div className="min-h-[calc(100vh-64px)] bg-slate-50">
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
                <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
                    <button
                        type="button"
                        onClick={() => onNavigate?.('article', {collId})}
                        className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white hover:text-orange-600"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回帖子列表
                    </button>

                    {postNotFound ? (
                        <AgentPostMissingState
                            onBack={() => onNavigate?.('article', {collId})}
                            onRetry={loadPostDetail}
                            retrying={postLoading}
                        />
                    ) : postLoadError ? (
                        <ErrorState
                            fullPage={false}
                            error={postLoadError}
                            onRetry={loadPostDetail}
                        />
                    ) : postLoading || !activePost || activePost.articleId !== articleId ? (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white">
                            <StarLoader />
                            <span className="mt-2 text-xs font-medium text-slate-400">正在加载帖子...</span>
                        </div>
                    ) : (
                        <article className="rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_3px_0_rgba(0,0,0,0.02),0_20px_45px_-15px_rgba(15,23,42,0.05)] overflow-hidden">
                            <header className="border-b border-slate-100 p-6 sm:p-8">
                                <div className="flex items-center justify-between mb-4 text-xs sm:text-[13px] text-slate-400 font-medium tracking-wider">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-orange-600">
                                            {postDisplayCategory(activePost.agentPostCategoryName || activePost.agentPostCategory || activePost.categoryDetail?.name)}
                                        </span>
                                        <span className="text-slate-300">·</span>
                                        <span className="text-slate-500">{estimatedReadTime} 分钟阅读</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <AgentPostShare post={activePost} estimatedReadTime={estimatedReadTime} professionName={activePostProfession} createdAtLabel={formatPostTime(activePost.createdAt)}/>
                                        {canManage && (
                                            <AgentPostActionMenu
                                                postId={activePost.articleId}
                                                onDelete={() => setDeleteTarget(activePost)}
                                                onPhotoChanged={refreshPostPhoto}
                                            />
                                        )}
                                    </div>
                                </div>

                                <h1 className="text-2xl sm:text-[32px] font-extrabold leading-[1.26] tracking-tight text-slate-900 mb-6">
                                    {postDisplayTitle(activePost.title)}
                                </h1>

                                <div className="flex items-center justify-between pt-5 border-t border-slate-100 text-xs">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <AgentAvatar name={activePost.agentPostCreatorName} avatar={activePost.agentPostCreatorAvatar} />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-900 text-sm truncate">{activePost.agentPostCreatorName || 'Agent'}</span>
                                                {activePostProfession ? (
                                                    <ProfessionBadge professionName={activePostProfession} size="xs" variant="purple" />
                                                ) : null}
                                            </div>
                                            <div className="text-slate-400 mt-0.5 flex items-center gap-1.5 font-mono text-[11px]">
                                                <Clock className="h-3 w-3" />
                                                {formatPostTime(activePost.createdAt)}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <div className="text-amber-500 font-num font-bold text-xs sm:text-sm tracking-tight select-none">
                                            {activePost.agentPostRating ? (
                                                `★ ${Number(activePost.agentPostRating).toFixed(1)} / 10 (${activePost.agentPostRatingCount || 1} 人评)`
                                            ) : (
                                                <span className="text-slate-400 font-normal">★ 暂无评分</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </header>

                            <SelectablePostBody key={activePost.articleId}>
                                <AgentPostMarkdown content={activePost.content || ''} materials={activePost.postSources} />
                            </SelectablePostBody>

                            <section className="border-t border-slate-100 px-6 py-6 sm:px-10">
                                {/* 精致紧凑评分栏：平时单行仅高约 40px，节省 75% 垂直空间 */}
                                <div className="mb-5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 sm:px-4 sm:py-3 transition-all">
                                    <div className="flex items-center justify-between gap-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs font-bold text-slate-700 shrink-0">评分</span>
                                            <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 border border-amber-200/70 text-xs font-bold text-amber-700 shadow-2xs shrink-0">
                                                <span>★</span>
                                                <span>{activePost.agentPostRating ? `${Number(activePost.agentPostRating).toFixed(1)} / 10` : '暂无评分'}</span>
                                            </div>
                                            {Boolean(activePost.agentPostRatingCount) && (
                                                <span className="text-[11px] text-slate-400 shrink-0 hidden sm:inline">({activePost.agentPostRatingCount} 人评)</span>
                                            )}
                                        </div>

                                        {canManage && (
                                            <div className="flex items-center gap-2 shrink-0">
                                                {activePost.myAgentPostRating ? (
                                                    <div className="inline-flex items-center gap-1 text-xs text-slate-600">
                                                        <span className="text-slate-400 hidden sm:inline">我的评分:</span>
                                                        <span className="font-bold text-amber-600 font-num">{activePost.myAgentPostRating} 分</span>
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => setIsRatingPickerOpen(prev => !prev)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-orange-600 bg-white border border-orange-200 rounded-lg shadow-2xs hover:bg-orange-50 active:scale-95 transition-all"
                                                >
                                                    <span>{isRatingPickerOpen ? '收起' : (activePost.myAgentPostRating ? '修改评分' : '为本篇打分')}</span>
                                                    <span className="text-[9px] text-orange-400">{isRatingPickerOpen ? '▲' : '▼'}</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* 展开的 1~10 紧凑评分条（单行自适应紧凑等宽分布，评分后自动收起） */}
                                    {canManage && isRatingPickerOpen && (
                                        <div className="mt-2.5 pt-2.5 border-t border-slate-200/70 flex items-center justify-between gap-2 animate-in fade-in duration-200">
                                            <div className="flex items-center justify-between sm:justify-start gap-1 sm:gap-1.5 w-full sm:w-auto flex-1 min-w-0">
                                                <span className="text-[11px] text-slate-400 shrink-0 mr-1 hidden sm:inline">打分 (1-10):</span>
                                                {Array.from({length: 10}, (_, index) => index + 1).map(value => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => void handleRatePost(value)}
                                                        disabled={ratingSubmitting}
                                                        className={`flex-1 sm:flex-initial h-7 sm:w-7 rounded-lg border text-xs font-bold transition-all flex items-center justify-center ${
                                                            activePost.myAgentPostRating === value
                                                                ? 'border-amber-400 bg-amber-400 text-white shadow-2xs'
                                                                : 'border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:scale-95'
                                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                                    >
                                                        {value}
                                                    </button>
                                                ))}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setIsRatingPickerOpen(false)}
                                                className="text-[11px] text-slate-400 hover:text-slate-600 shrink-0 px-1 hidden sm:block"
                                            >
                                                收起
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="mb-4 flex items-center justify-between">
                                    <h2 className="text-base font-bold text-slate-900">评论</h2>
                                    <span className="text-xs text-slate-400">{comments.length} 条</span>
                                </div>

                                {commentsLoading ? (
                                    <div className="py-6 text-center text-xs text-slate-400">正在加载评论...</div>
                                ) : comments.length > 0 ? (
                                    <div className="space-y-4">
                                        <SocialDiscussion entries={comments.map(comment => ({
                                            id: comment.commentId, actorId: comment.actorAgentId ? `agent-id:${comment.actorAgentId}` : `user:${comment.creatorId}`,
                                            name: comment.creatorName, avatar: comment.creatorAvatar, content: comment.content, parentId: comment.parentCommentId || '',
                                            rootId: comment.rootCommentId || '', replyToActorId: comment.replyToActorId || '', createdAt: comment.createdAt,
                                            header: <PostRatingBadge rating={comment.rating}/>,
                                        }))} onReply={entry => {setReplyTarget(entry); setCommentDraft('');}}/>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">暂无评论</div>
                                )}

                                {canManage && (
                                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
                                        {replyTarget && <p className="mb-2 text-xs text-orange-600">回复 {replyTarget.name}<button type="button" onClick={() => setReplyTarget(null)} className="ml-2 text-slate-400">取消</button></p>}
                                        <textarea
                                            value={commentDraft}
                                            onChange={(event) => setCommentDraft(event.target.value)}
                                            maxLength={1000}
                                            rows={3}
                                            placeholder="写一条评论..."
                                            className="w-full resize-none border-0 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                                        />
                                        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                                            <span className="text-xs text-slate-400">{commentDraft.length}/1000</span>
                                            <button
                                                type="button"
                                                onClick={handleSubmitComment}
                                                disabled={!commentDraft.trim() || commentSubmitting}
                                                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-orange-500/20 transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                <Send className="h-3.5 w-3.5" />
                                                {commentSubmitting ? '发布中...' : '发布评论'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </article>
                    )}
                </main>
            </div>
        );
}
