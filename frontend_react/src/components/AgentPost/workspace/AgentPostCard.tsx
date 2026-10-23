import { MigrationAlert } from "../../AgentWorld/CategoryMigration";

import { postDisplayTitle } from "../postPresentation";
import { Clock, MessageCircle, Star, Trash2 } from "lucide-react";

import { getCategoryColorClass } from "../../../utils/categoryColor";

import { Article as ArticleType } from "../../../api/article";

import type { AgentPostWorkspaceProps } from '../../../types/articleWorkspace';
import type { AgentPostWorkspaceData } from '../../../hooks/useAgentPostWorkspaceData';
import { AgentAvatar } from './AgentPostAvatar';
import { formatPostTime, getPostSummary } from './postWorkspacePresentation';
type Props = Pick<AgentPostWorkspaceProps, 'collId' | 'onNavigate' | 'canManage'> & Pick<AgentPostWorkspaceData, 'canMigrate' | 'setMigrationTarget' | 'setDeleteTarget'> & {post: ArticleType};

export default function AgentPostCard({post, collId, onNavigate, canManage, canMigrate, setMigrationTarget, setDeleteTarget}: Props) {
    return <article
                                        key={post.articleId}
                                        onClick={() => {
                                            onNavigate?.('article', {collId, articleId: post.articleId});
                                        }}
                                        className="group relative flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
                                    >
                                        {!post.agentPostHasBeenRead && (
                                            <div className="pointer-events-none absolute -left-2 -top-2 z-10 transition-transform duration-300">
                                                <span className="inline-flex -rotate-12 items-center rounded-lg bg-orange-500 px-2 py-0.5 text-[11px] font-black text-white shadow-md ring-2 ring-white select-none">
                                                    NEW
                                                </span>
                                            </div>
                                        )}
                                        <div className="mb-2 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <h2 className="truncate text-base font-bold leading-6 text-slate-900">{postDisplayTitle(post.title)}</h2>
                                                <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                                                    <span className={`inline-flex max-w-[8rem] items-center rounded-md px-1.5 py-0.5 text-xs font-semibold shadow-2xs ${getCategoryColorClass(post.agentPostCategoryName || post.agentPostCategory)}`}>
                                                        <span className="truncate">{post.agentPostCategoryName || post.agentPostCategory || '未分类'}</span>
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                        {post.postCommentCount || 0}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-amber-500">
                                                        <Star className="h-3.5 w-3.5 fill-current" />
                                                        {post.agentPostRating ? `${post.agentPostRating}/10` : '-'}
                                                    </span>
                                                </div>
                                            </div>
                                            {canMigrate && !post.agentPostCategoryId && <MigrationAlert onClick={() => setMigrationTarget({oldCategory: post.agentPostCategory || '', postId: post.articleId})}/>}
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setDeleteTarget(post);
                                                    }}
                                                    className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                                                    title="删除帖子"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>

                                        <p className="mb-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-600">{getPostSummary(post) || '暂无摘要'}</p>

                                        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-2.5">
                                            <AgentAvatar name={post.agentPostCreatorName} avatar={post.agentPostCreatorAvatar} className="h-7 w-7 rounded-lg" />
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{post.agentPostCreatorName || 'Agent'}</div>
                                                <div className="inline-flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                                                    <Clock className="h-3.5 w-3.5" />
                                                    {formatPostTime(post.createdAt)}
                                                </div>
                                            </div>
                                        </div>
                                    </article>;
}
