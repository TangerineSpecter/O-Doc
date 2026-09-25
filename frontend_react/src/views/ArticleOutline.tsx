import {ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {ArrowLeft, Bot, Clock, ListTree, Menu, MessageCircle, Send, Star, Trash2} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {useEscapeDismissal} from '../hooks/useEscapeDismissal';
import Article from './Article';
import ConfirmationModal from '../components/common/ConfirmationModal';
import {getHtmlDeletionSummary} from '../api/htmlNote';
import SaveWebpageModal, {type WebpageImportOptions, type WebpageImportProgress} from '../components/common/SaveWebpageModal';
import {
    CodeBlock,
    CUSTOM_STYLES,
    MermaidChart,
    rehypeInlineStyleSyntax,
    remarkQuoteVariants,
    SimpleChart,
    VariantBlockquote,
} from '../components/Article/MarkdownElements';
import OutlineSidebar from '../components/Outline/OutlineSidebar';
import OutlineContent from '../components/Outline/OutlineContent';
import {isImageAvatarValue} from '../utils/avatar';
import {useArticleTree} from '../hooks/useArticleTree';
import {
    AgentPostComment,
    AgentPostLatestCommentListResult,
    Article as ArticleType,
    createAgentPostComment,
    deleteArticle,
    getAgentPostLatestComments,
    getAgentPostComments,
    getArticleDetail,
    getArticles,
    importArticleFiles,
    rateAgentPost,
    saveWebpageAsArticle
} from '../api/article';
import {useToast} from '../components/common/ToastProvider';
import {Anthology, getAnthologyDetail} from '../api/anthology';
import {getIconComponent} from '../constants/iconList';
import StarLoader from '../components/common/StarLoader';
import {syncCollectionToRag} from '../api/rag';
import {useAuth} from '../contexts/AuthContext';

// 定义最小 Loading 时间 (毫秒)，防止闪烁
const MIN_LOADING_TIME = 500;

const formatImportFailures = (failures: Array<{fileName: string; message: string}>) => {
    const displayed = failures.slice(0, 3).map(item => `${item.fileName}：${item.message}`);
    if (failures.length > displayed.length) displayed.push(`另有 ${failures.length - displayed.length} 个文件失败`);
    return displayed.join('；');
};

const formatPostTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const getPostSummary = (post: ArticleType) => {
    if (post.postSummary?.trim()) return post.postSummary.trim();
    return (post.content || '').replace(/[#*`>~-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
};

const getMarkdownNodeText = (node: ReactNode): string => {
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(getMarkdownNodeText).join('');
    if (node && typeof node === 'object' && 'props' in node) {
        return getMarkdownNodeText((node as { props?: { children?: ReactNode } }).props?.children);
    }
    return '';
};

const getMarkdownHeadingId = (children: ReactNode) => getMarkdownNodeText(children)
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

const agentPostMarkdownComponents = {
    pre: (props: any) => <div className="not-prose">{props.children}</div>,
    code(props: any) {
        const {inline, className, children, ...rest} = props;
        const match = /language-(\w+)/.exec(className || '');
        const lang = match ? match[1] : '';
        const codeStr = String(children).replace(/\n$/, '');

        if (!inline && lang === 'mermaid') {
            return <MermaidChart chart={codeStr} />;
        }

        if (!inline && lang === 'chart') {
            return <SimpleChart chart={codeStr} />;
        }

        if (!inline && match) {
            return <CodeBlock language={lang} code={codeStr} {...rest} />;
        }

        return (
            <code
                className="article-inline-code bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-[0.9em] mx-1 break-words leading-[1.9]"
                {...props}
            >
                {children}
            </code>
        );
    },
    h2: ({children}: { children: ReactNode }) => (
        <h2 id={getMarkdownHeadingId(children)} className="agent-post-chapter-heading">
            <span className="agent-post-chapter-index" aria-hidden="true" />
            <span className="agent-post-chapter-title">{children}</span>
        </h2>
    ),
    blockquote: VariantBlockquote,
};

const AgentAvatar = ({name, avatar, className = ''}: { name?: string; avatar?: string; className?: string }) => {
    const value = avatar?.trim();
    const initial = (name || 'A').trim().slice(0, 1).toUpperCase();
    const isImage = isImageAvatarValue(value);

    return (
        <span className={`flex shrink-0 items-center justify-center overflow-hidden bg-indigo-100 ring-1 ring-indigo-200 ${className || 'h-8 w-8 rounded-full'}`}>
            {isImage ? (
                <img src={value} alt={name || 'Agent'} className="h-full w-full object-cover" />
            ) : (
                <span className="text-xs font-bold text-indigo-700">{value || initial}</span>
            )}
        </span>
    );
};

interface ArticleOutlineProps {
    onNavigate?: (viewName: string, params?: any) => void;
    collId?: string;
    title?: string;
    articleId?: string;
}

function AgentPostCollectionView({
                                     collId,
                                     articleId,
                                     anthologyInfo,
                                     onNavigate,
                                     onBackHome,
                                     canManage
                                 }: {
    collId?: string;
    articleId?: string;
    anthologyInfo: Anthology | null;
    onNavigate?: (viewName: string, params?: any) => void;
    onBackHome?: () => void;
    canManage: boolean;
}) {
    const [posts, setPosts] = useState<ArticleType[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ArticleType | null>(null);
    const [activePost, setActivePost] = useState<ArticleType | null>(null);
    const [postLoading, setPostLoading] = useState(false);
    const [comments, setComments] = useState<AgentPostComment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentDraft, setCommentDraft] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const [latestComments, setLatestComments] = useState<AgentPostLatestCommentListResult['comments']>([]);
    const toast = useToast();

    const categoryStats = posts.reduce<Array<{ name: string; count: number }>>((acc, post) => {
        const name = post.agentPostCategory?.trim() || '未分类';
        const found = acc.find(item => item.name === name);
        if (found) found.count += 1;
        else acc.push({name, count: 1});
        return acc;
    }, []);

    const visiblePosts = activeCategory === 'all'
        ? posts
        : posts.filter(post => (post.agentPostCategory?.trim() || '未分类') === activeCategory);

    const commentRankPosts = [...posts]
        .sort((a, b) => (b.postCommentCount || 0) - (a.postCommentCount || 0))
        .slice(0, 5);

    const truncateText = (value?: string, max = 56) => {
        const text = (value || '').replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max)}...` : text;
    };

    const loadPosts = useCallback(async () => {
        if (!collId) return;
        setLoading(true);
        try {
            const [data, latestCommentResult] = await Promise.all([
                getArticles({collId}),
                getAgentPostLatestComments(collId, 10)
            ]);
            setPosts([...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLatestComments(latestCommentResult.comments || []);
        } catch (error) {
            console.error('加载 Agent 帖子失败:', error);
            toast.error('加载 Agent 帖子失败');
        } finally {
            setLoading(false);
        }
    }, [collId, toast]);

    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    const loadPostDetail = useCallback(async () => {
        if (!articleId) {
            setActivePost(null);
            setComments([]);
            return;
        }
        setPostLoading(true);
        setCommentsLoading(true);
        try {
            const [detail, commentResult] = await Promise.all([
                getArticleDetail(articleId),
                getAgentPostComments(articleId)
            ]);
            setActivePost(detail);
            setComments(commentResult.comments || []);
        } catch (error) {
            console.error('加载 Agent 帖子详情失败:', error);
            toast.error('加载帖子详情失败');
            setActivePost(null);
            setComments([]);
        } finally {
            setPostLoading(false);
            setCommentsLoading(false);
        }
    }, [articleId, toast]);

    useEffect(() => {
        loadPostDetail();
    }, [loadPostDetail]);

    useEffect(() => {
        if (commentsLoading || !window.location.hash.startsWith('#comment-')) return;
        const targetId = decodeURIComponent(window.location.hash.slice('#comment-'.length));
        const target = document.getElementById(`comment-${targetId}`);
        target?.scrollIntoView({behavior: 'smooth', block: 'center'});
    }, [comments, commentsLoading]);

    const confirmDeletePost = async () => {
        if (!deleteTarget) return;
        try {
            await deleteArticle(deleteTarget.articleId);
            setPosts(prev => prev.filter(post => post.articleId !== deleteTarget.articleId));
            if (activePost?.articleId === deleteTarget.articleId) {
                setActivePost(null);
                onNavigate?.('article', {collId});
            }
            setDeleteTarget(null);
            toast.success('帖子已移入回收站');
        } catch (error) {
            console.error('删除 Agent 帖子失败:', error);
            toast.error(error instanceof Error ? error.message : '删除帖子失败');
        }
    };

    const handleSubmitComment = async () => {
        if (!activePost || !commentDraft.trim() || commentSubmitting) return;
        setCommentSubmitting(true);
        try {
            const result = await createAgentPostComment(activePost.articleId, commentDraft.trim());
            setComments(prev => [...prev, result.comment]);
            setActivePost(prev => prev ? {
                ...prev,
                postCommentCount: (prev.postCommentCount || 0) + 1
            } : prev);
            setPosts(prev => prev.map(post => post.articleId === activePost.articleId ? {
                ...post,
                postCommentCount: (post.postCommentCount || 0) + 1
            } : post));
            setLatestComments(prev => [{
                commentId: result.comment.commentId,
                articleId: activePost.articleId,
                postTitle: activePost.title,
                content: result.comment.content,
                agentName: activePost.agentPostCreatorName || 'Agent',
                agentAvatar: activePost.agentPostCreatorAvatar || '',
                createdAt: result.comment.createdAt
            }, ...prev].slice(0, 10));
            setCommentDraft('');
            toast.success('评论已发布');
        } catch (error) {
            console.error('发布评论失败:', error);
            toast.error(error instanceof Error ? error.message : '发布评论失败');
        } finally {
            setCommentSubmitting(false);
        }
    };

    const handleRatePost = async (rating: number) => {
        if (!activePost || ratingSubmitting) return;
        setRatingSubmitting(true);
        try {
            const result = await rateAgentPost(activePost.articleId, rating);
            setActivePost(prev => prev ? {
                ...prev,
                agentPostRating: result.rating,
                agentPostRatingCount: result.ratingCount,
                myAgentPostRating: result.myRating
            } : prev);
            setPosts(prev => prev.map(post => post.articleId === activePost.articleId ? {
                ...post,
                agentPostRating: result.rating,
                agentPostRatingCount: result.ratingCount,
                myAgentPostRating: result.myRating
            } : post));
            toast.success('评分已保存');
        } catch (error) {
            console.error('保存评分失败:', error);
            toast.error(error instanceof Error ? error.message : '保存评分失败');
        } finally {
            setRatingSubmitting(false);
        }
    };

    if (articleId) {
        return (
            <div className="min-h-[calc(100vh-64px)] bg-slate-50">
                <style>{CUSTOM_STYLES}</style>
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
                <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
                    <button
                        type="button"
                        onClick={() => onNavigate?.('article', {collId})}
                        className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-white hover:text-indigo-700"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        返回帖子列表
                    </button>

                    {postLoading || !activePost ? (
                        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-100 bg-white">
                            <StarLoader />
                            <span className="mt-2 text-xs font-medium text-slate-400">正在加载帖子...</span>
                        </div>
                    ) : (
                        <article className="rounded-xl border border-indigo-200 bg-white shadow-sm">
                            <header className="border-b border-slate-100 p-5 sm:p-6">
                                <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
                                    <ListTree className="h-3.5 w-3.5" />
                                    {activePost.agentPostCategory || '未分类'}
                                </div>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <h1 className="text-2xl font-bold leading-tight text-slate-900">{activePost.title}</h1>
                                        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                            <span className="inline-flex items-center gap-1.5">
                                                <MessageCircle className="h-4 w-4" />
                                                {activePost.postCommentCount || comments.length || 0}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 text-amber-500">
                                                <Star className="h-4 w-4 fill-current" />
                                                {activePost.agentPostRating ? `${activePost.agentPostRating}/10` : '未评分'}
                                                {activePost.agentPostRatingCount ? <span className="text-slate-400">({activePost.agentPostRatingCount})</span> : null}
                                            </span>
                                        </div>
                                    </div>
                                    {canManage && (
                                        <button
                                            type="button"
                                            onClick={() => setDeleteTarget(activePost)}
                                            className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                                            title="删除帖子"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="mt-5 flex items-center gap-2">
                                    <AgentAvatar name={activePost.agentPostCreatorName} avatar={activePost.agentPostCreatorAvatar} />
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-semibold text-slate-800">{activePost.agentPostCreatorName || 'Agent'}</div>
                                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                                            <Clock className="h-3.5 w-3.5" />
                                            {formatPostTime(activePost.createdAt)}
                                        </div>
                                    </div>
                                </div>
                            </header>

                            <div className="agent-post-body prose prose-slate max-w-none px-5 py-6 text-slate-700 sm:px-6">
                                <ReactMarkdown
                                    remarkPlugins={[remarkQuoteVariants, remarkGfm]}
                                    rehypePlugins={[rehypeInlineStyleSyntax]}
                                    components={agentPostMarkdownComponents as any}
                                >
                                    {activePost.content || ''}
                                </ReactMarkdown>
                            </div>

                            <section className="border-t border-slate-100 px-5 py-5 sm:px-6">
                                <div className="mb-5 rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h2 className="text-base font-bold text-slate-900">评分</h2>
                                            <p className="mt-1 text-xs text-slate-500">
                                                当前 {activePost.agentPostRating ? `${activePost.agentPostRating}/10` : '未评分'}
                                                {activePost.agentPostRatingCount ? `，${activePost.agentPostRatingCount} 人评分` : ''}
                                            </p>
                                        </div>
                                        {canManage && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {Array.from({length: 10}, (_, index) => index + 1).map(value => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        onClick={() => handleRatePost(value)}
                                                        disabled={ratingSubmitting}
                                                        className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-bold transition-all ${
                                                            activePost.myAgentPostRating === value
                                                                ? 'border-amber-400 bg-amber-400 text-white shadow-sm shadow-amber-400/30'
                                                                : 'border-amber-200 bg-white text-amber-600 hover:border-amber-300 hover:bg-amber-100'
                                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                                    >
                                                        {value}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mb-4 flex items-center justify-between">
                                    <h2 className="text-base font-bold text-slate-900">评论</h2>
                                    <span className="text-xs text-slate-400">{comments.length} 条</span>
                                </div>

                                {commentsLoading ? (
                                    <div className="py-6 text-center text-xs text-slate-400">正在加载评论...</div>
                                ) : comments.length > 0 ? (
                                    <div className="space-y-4">
                                        {comments.map(comment => (
                                            <div id={`comment-${comment.commentId}`} key={comment.commentId} className="flex scroll-mt-24 gap-3 rounded-lg bg-slate-50 px-3 py-3">
                                                <AgentAvatar name={comment.creatorName} avatar={comment.creatorAvatar} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-semibold text-slate-800">{comment.creatorName || '用户'}</span>
                                                        <span className="text-xs text-slate-400">{formatPostTime(comment.createdAt)}</span>
                                                    </div>
                                                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{comment.content}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-sm text-slate-400">暂无评论</div>
                                )}

                                {canManage && (
                                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3">
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
                <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
                                <ListTree className="h-3.5 w-3.5" />
                                帖子
                            </div>
                            <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900">{anthologyInfo?.title || 'Agent'}</h1>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{anthologyInfo?.description || '暂无简介'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onBackHome}
                        className="inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
                    >
                        返回首页
                    </button>
                </div>

                <div className="mb-5 flex gap-2 overflow-x-auto pb-1 scrollbar-hide no-scrollbar touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <button
                        type="button"
                        onClick={() => setActiveCategory('all')}
                        className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                            activeCategory === 'all'
                                ? 'border-red-400 bg-white text-slate-900 shadow-sm'
                                : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                    >
                        全部 {posts.length}
                    </button>
                    {categoryStats.map(category => (
                        <button
                            key={category.name}
                            type="button"
                            onClick={() => setActiveCategory(category.name)}
                            className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                                activeCategory === category.name
                                    ? 'border-red-400 bg-white text-slate-900 shadow-sm'
                                    : 'border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white'
                            }`}
                        >
                            {category.name} {category.count}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-100 bg-white">
                        <StarLoader />
                        <span className="mt-2 text-xs font-medium text-slate-400">正在加载 Agent 帖子...</span>
                    </div>
                ) : visiblePosts.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] min-[1900px]:relative min-[1900px]:block">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3 min-[1900px]:mx-auto min-[1900px]:max-w-[1120px]">
                            {visiblePosts.map(post => (
                                <article
                                    key={post.articleId}
                                    onClick={() => onNavigate?.('article', {collId, articleId: post.articleId})}
                                    className="flex h-full cursor-pointer flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-[0_24px_60px_rgba(15,23,42,0.12)]"
                                >
                                    <div className="mb-2 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h2 className="truncate text-base font-bold leading-6 text-slate-900">{post.title}</h2>
                                            <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-400">
                                                <span className="inline-flex max-w-[8rem] items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 font-medium text-orange-700">
                                                    <span className="truncate">{post.agentPostCategory || '未分类'}</span>
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
                                </article>
                            ))}
                        </div>

                        <aside className="space-y-5 min-[1900px]:absolute min-[1900px]:left-[calc(50%+584px)] min-[1900px]:top-0 min-[1900px]:w-[360px]">
                            <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                                <div className="border-b border-slate-100 px-5 py-4">
                                    <h2 className="text-lg font-bold text-red-700">评论排行榜</h2>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {commentRankPosts.length > 0 ? commentRankPosts.map((post, index) => (
                                        <button
                                            key={post.articleId}
                                            type="button"
                                            onClick={() => onNavigate?.('article', {collId, articleId: post.articleId})}
                                            className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-orange-50/50"
                                        >
                                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                                                index === 0
                                                    ? 'bg-yellow-300 text-orange-800'
                                                    : index === 1
                                                        ? 'bg-slate-200 text-slate-600'
                                                        : index === 2
                                                            ? 'bg-orange-200 text-orange-800'
                                                            : 'text-slate-400'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{post.title}</span>
                                            <span className="inline-flex shrink-0 items-center gap-1 text-sm text-slate-500">
                                                <MessageCircle className="h-4 w-4" />
                                                {post.postCommentCount || 0}
                                            </span>
                                        </button>
                                    )) : (
                                        <div className="px-5 py-8 text-center text-sm text-slate-400">暂无评论数据</div>
                                    )}
                                </div>
                            </section>

                            <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
                                <div className="border-b border-slate-100 px-5 py-4">
                                    <h2 className="text-lg font-bold text-red-700">最新评论</h2>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    {latestComments.length > 0 ? latestComments.map(comment => (
                                        <button
                                            key={comment.commentId}
                                            type="button"
                                            onClick={() => onNavigate?.('article', {collId, articleId: comment.articleId})}
                                            className="flex w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-orange-50/50"
                                        >
                                            <AgentAvatar name={comment.agentName} avatar={comment.agentAvatar} />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-sm font-semibold text-slate-800">{comment.agentName || 'Agent'}</span>
                                                    <span className="shrink-0 text-[11px] text-slate-400">{formatPostTime(comment.createdAt)}</span>
                                                </span>
                                                <span className="mt-1 block truncate text-xs font-medium text-slate-500">{comment.postTitle}</span>
                                                <span className="mt-1 block text-xs leading-5 text-slate-500">{truncateText(comment.content, 64) || '暂无内容'}</span>
                                            </span>
                                        </button>
                                    )) : (
                                        <div className="px-5 py-8 text-center text-sm text-slate-400">暂无最新评论</div>
                                    )}
                                </div>
                            </section>
                        </aside>
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

export default function ArticleOutline({onNavigate, collId, title, articleId}: ArticleOutlineProps) {
    const navigate = useNavigate();
    const {isAuthenticated} = useAuth();

    const {
        filteredDocs,
        flatDocs,
        loading,
        expandedIds,
        searchQuery,
        setSearchQuery,
        toggleExpand,
        refreshTree
    } = useArticleTree(collId);

    const [activeDocId, setActiveDocId] = useState<string | undefined>(articleId);
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.innerWidth >= 768);
    useEscapeDismissal(isSidebarOpen && window.innerWidth < 768, () => setIsSidebarOpen(false));
    const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);
    const [hasArticleToc, setHasArticleToc] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isWebpageModalOpen, setIsWebpageModalOpen] = useState(false); // 新增状态

    const [articleDetail, setArticleDetail] = useState<ArticleType | null>(null);
    const [articleLoading, setArticleLoading] = useState(false);
    const [anthologyInfo, setAnthologyInfo] = useState<Anthology | null>(null);
    const [isCollectionSyncing, setIsCollectionSyncing] = useState(false);

    const toast = useToast();

    // 记录开始 Loading 的时间，用于计算剩余等待时间
    const loadingStartTime = useRef<number>(0);

    useEffect(() => {
        setActiveDocId(articleId);
        setIsMobileTocOpen(false);
        setHasArticleToc(false);
    }, [articleId]);

    useEffect(() => {
        if (collId) {
            getAnthologyDetail(collId).then(data => setAnthologyInfo(data)).catch(console.error);
        }
    }, [collId]);

    // --- 核心修改：平滑 Loading 逻辑 ---
    useEffect(() => {
        if (!activeDocId) {
            setArticleDetail(null);
            return;
        }

        const fetchArticleDetail = async () => {
            try {
                // 1. 开始 Loading
                setArticleLoading(true);
                loadingStartTime.current = Date.now();

                // 2. 并行执行：获取数据 + 最小等待时间
                // 无论数据返回多快，至少等待 MIN_LOADING_TIME
                const [detail] = await Promise.all([
                    getArticleDetail(activeDocId),
                    new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME))
                ]);

                // 3. 更新数据并预判文章是否有目录标题（## ~ ######），消除加载完成后本文目录按钮突兀跳出的问题
                const hasToc = Boolean(
                    detail?.content && /(?:^|\n)#{2,6}\s+\S+/m.test(detail.content)
                );
                setHasArticleToc(hasToc);
                setArticleDetail(detail);
            } catch (error) {
                console.error('获取文章详情失败:', error);
                setArticleDetail(null);
                setHasArticleToc(false);
            } finally {
                // 4. 结束 Loading
                setArticleLoading(false);
            }
        };

        fetchArticleDetail();
    }, [activeDocId]);

    const handleSelectDoc = (docArticleId: string) => {
        setActiveDocId(docArticleId);
        if (window.innerWidth < 768) setIsSidebarOpen(false);
        setIsMobileTocOpen(false);
        const mainContainer = document.getElementById('right-content-window');
        if (mainContainer) mainContainer.scrollTop = 0;
        if (onNavigate) onNavigate('article', {collId, articleId: docArticleId});
    };

    const handleResetView = () => {
        setActiveDocId(undefined);
        setIsMobileTocOpen(false);
        setHasArticleToc(false);
        if (onNavigate) onNavigate('article', {collId});
    };

    const handleTocAvailabilityChange = useCallback((hasToc: boolean) => {
        setHasArticleToc(hasToc);
        if (!hasToc) setIsMobileTocOpen(false);
    }, []);

    //新建文档
    const handleCreateDoc = () => {
        if (!isAuthenticated) return;
        navigate(`/editor?collId=${collId}`);
    };
    //新建 web 内容解析
    const handleOpenWebpageModal = () => {
        if (!isAuthenticated) return;
        setIsWebpageModalOpen(true);
    };

    // 执行网址或本地文件导入
    const handleSaveWebpage = async (
        options: WebpageImportOptions,
        onProgress: (progress: WebpageImportProgress) => void,
    ) => {
        if (!isAuthenticated || !collId) return;

        try {
            const {useAiExtraction, needPolishing} = options;
            if (options.sourceType === 'url') {
                const newArticle = await saveWebpageAsArticle({
                    url: options.url,
                    useAiExtraction,
                    needPolishing,
                    collId,
                });
                const warnings = newArticle.importReport?.warnings || [];
                if (warnings.length) {
                    const polishingHint = needPolishing ? '，AI 正在后台润色' : '';
                    toast.warning(`文章已导入${polishingHint}：${warnings.join('；')}`);
                } else {
                    toast.success(needPolishing ? '文章已导入，AI 正在后台润色...' : '文章导入成功！');
                }
                setIsWebpageModalOpen(false);
                await refreshTree();
                if (newArticle.articleId) handleSelectDoc(newArticle.articleId);
                return;
            }

            const batchResult = await importArticleFiles({
                    files: options.files,
                    importMode: options.importMode,
                    useAiExtraction,
                    needPolishing,
                    collId,
                    onProgress,
                });
            const successCount = batchResult.successful.length;
            if (!successCount) {
                throw new Error(`批量导入失败：${formatImportFailures(batchResult.failures)}`);
            }

            const warningCount = batchResult.successful.reduce(
                (count, article) => count + (article.importReport?.warnings.length || 0),
                0,
            );
            const polishingHint = needPolishing ? '，AI 正在后台润色' : '';
            if (batchResult.failures.length) {
                toast.warning(
                    `已导入 ${successCount} 篇${polishingHint}；${batchResult.failures.length} 个文件失败：${formatImportFailures(batchResult.failures)}`,
                );
            } else if (warningCount) {
                toast.warning(`已导入 ${successCount} 篇${polishingHint}，其中 ${warningCount} 项需要核对`);
            } else {
                toast.success(`成功导入 ${successCount} 篇文章${polishingHint}`);
            }
            setIsWebpageModalOpen(false);
            await refreshTree();
            const lastArticle = batchResult.successful[batchResult.successful.length - 1];
            if (lastArticle?.articleId) handleSelectDoc(lastArticle.articleId);
        } catch (error: unknown) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '文章解析失败，请稍后重试');
            throw error; // 抛出错误让 Modal 停止 loading
        }
    };

    const handleEditArticle = () => {
        if (!isAuthenticated || !activeDocId) return;
        navigate(`/editor/${activeDocId}`);
    };

    const [deleteDescription, setDeleteDescription] = useState('删除后将移入回收站，可从回收站恢复。');
    const handleDeleteArticle = async () => {
        if (!isAuthenticated || !activeDocId) return;
        if (articleDetail?.contentFormat === 'html') {
            try {
                const summary = await getHtmlDeletionSummary(activeDocId);
                setDeleteDescription(`此操作不可恢复，将清理 ${summary.exclusiveCount} 个专属资源，保留 ${summary.sharedCount} 个共享或已有资源。`);
            } catch (reason) {toast.error(reason instanceof Error ? reason.message : '无法读取资源清理信息'); return;}
        } else if (articleDetail?.contentFormat === 'markdown') {
            setDeleteDescription('删除后将移入回收站，可从回收站恢复。');
        } else {
            setDeleteDescription('确定要删除当前文档吗？此操作无法恢复。');
        }
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!isAuthenticated || !activeDocId) return;
        try {
            await deleteArticle(activeDocId);
            toast.success(articleDetail?.contentFormat === 'html' ? 'HTML 笔记删除成功' : '文章已移入回收站');
            setActiveDocId(undefined);
            if (onNavigate) onNavigate('article', {collId});
            setIsDeleteModalOpen(false);
            window.location.reload();
        } catch (error: any) {
            const err = error as Error;
            toast.error(err.message || '删除文章失败');
            setIsDeleteModalOpen(false);
        }
    };

    if (loading && flatDocs.length === 0) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#F9FAFB] flex-col">
                <StarLoader/>
                <span className="text-xs text-slate-400 mt-2 font-medium">正在加载知识库...</span>
            </div>
        );
    }

    const displayTitle = anthologyInfo?.title || title || '文档目录';
    const anthologyIcon = anthologyInfo ? getIconComponent(anthologyInfo.iconId, "w-6 h-6") : null;

    if (anthologyInfo?.type === 'agent') {
        return (
                <AgentPostCollectionView
                    collId={collId}
                    articleId={articleId}
                    anthologyInfo={anthologyInfo}
                    onNavigate={onNavigate}
                    onBackHome={() => onNavigate && onNavigate('home')}
                    canManage={isAuthenticated}
                />
        );
    }

    // [新增] 处理文集同步
    const handleSyncCollection = async () => {
        if (!isAuthenticated || !collId || isCollectionSyncing) return;

        if (!confirm('确定要将该文集下的所有文章同步至知识库吗？这可能需要一些时间。')) {
            return;
        }

        try {
            setIsCollectionSyncing(true);
            const result = await syncCollectionToRag(collId);
            const message = (result as { message?: string } | undefined)?.message;
            toast.success(message || '文集同步成功');
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : '同步失败，请检查模型连通性');
        } finally {
            setIsCollectionSyncing(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-64px)] bg-[#F9FAFB] text-slate-800 font-sans overflow-hidden">
            {isAuthenticated && (
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    onConfirm={confirmDelete}
                    title="删除文档"
                    description={deleteDescription}
                    confirmText={articleDetail?.contentFormat === 'markdown' ? '移入回收站' : '删除'}
                    type="danger"
                />
            )}

            {/* 新增：保存网页弹窗 */}
            {isAuthenticated && (
                <SaveWebpageModal
                    isOpen={isWebpageModalOpen}
                    onClose={() => setIsWebpageModalOpen(false)}
                    onConfirm={handleSaveWebpage}
                />
            )}

            {isSidebarOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-label="关闭文集目录"
                />
            )}

            <OutlineSidebar
                className={`
                    fixed inset-y-0 left-0 z-50 w-[min(82vw,20rem)] transform shadow-2xl transition-transform duration-300 ease-out
                    md:relative md:inset-auto md:z-auto md:w-72 md:translate-x-0 md:shadow-none
                    ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                `}
                title={displayTitle}
                docs={filteredDocs}
                activeDocId={activeDocId}
                expandedIds={expandedIds}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onToggleExpand={toggleExpand}
                onSelectDoc={handleSelectDoc}
                onCreateDoc={handleCreateDoc}
                onSaveWebpage={handleOpenWebpageModal}
                onReset={handleResetView}
                onSyncCollection={handleSyncCollection}
                isCollectionSyncing={isCollectionSyncing}
                canManage={isAuthenticated}
            />

            <main id="right-content-window"
                  className="min-w-0 flex-1 bg-white relative overflow-y-auto overflow-x-hidden scroll-smooth">
                {/* --- 全局平滑加载遮罩层 --- */}
                {/* 覆盖整个阅读窗口与移动端顶栏，加载时整体纯净遮罩，加载完成后顶栏与文章内容整体同步显现 */}
                <div
                    className={`
                        fixed inset-0 z-40 md:absolute md:z-30 flex items-center justify-center md:items-start md:pt-[25vh]
                        bg-white/95 backdrop-blur-[2px]
                        transition-all duration-300 ease-out
                        ${articleLoading ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}
                    `}
                >
                    <div
                        className={`transition-all duration-300 transform ${articleLoading ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'}`}>
                        <StarLoader/>
                    </div>
                </div>

                <div
                    className={`md:hidden sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-3 h-12 flex items-center justify-between transition-opacity duration-200 ${
                        articleLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'
                    }`}
                >
                    <button
                        type="button"
                        onClick={() => setIsSidebarOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                    >
                        <Menu size={18}/>
                        <span>文集目录</span>
                    </button>
                    <span className="min-w-0 truncate px-2 text-sm font-bold text-slate-700">{activeDocId ? '文章详情' : '目录大纲'}</span>
                    {activeDocId && hasArticleToc ? (
                        <button
                            type="button"
                            onClick={() => setIsMobileTocOpen(true)}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-orange-600 transition-colors hover:bg-orange-50"
                        >
                            <ListTree size={18}/>
                            <span>本文目录</span>
                        </button>
                    ) : (
                        <span className="w-[5.5rem]" aria-hidden="true"/>
                    )}
                </div>

                {activeDocId ? (
                    <div className="min-h-full bg-white relative">
                        {/* --- 文章内容 --- */}
                        <div
                            className={`transition-all duration-300 ease-out ${articleLoading ? 'opacity-0' : 'opacity-100'}`}>
                            <Article
                                onBack={handleResetView}
                                isEmbedded={true}
                                scrollContainerId="right-content-window"
                                onEdit={isAuthenticated ? handleEditArticle : undefined}
                                onDelete={isAuthenticated ? handleDeleteArticle : undefined}
                                canManage={isAuthenticated}
                                articleId={activeDocId}
                                content={articleDetail?.content}
                                contentFormat={articleDetail?.contentFormat}
                                collId={articleDetail?.collId}
                                permission={articleDetail?.permission}
                                downloadUrl={articleDetail?.downloadUrl}
                                title={articleDetail?.title}
                                category={articleDetail?.categoryDetail?.name || '未分类'}
                                categoryId={articleDetail?.categoryDetail?.categoryId}
                                themeId={(articleDetail?.categoryDetail as any)?.themeId}
                                tags={articleDetail?.tagDetails?.map(tag => tag.name) || []}
                                date={articleDetail?.updatedAt}
                                author={articleDetail?.author}
                                authorName={articleDetail?.authorName}
                                attachments={articleDetail?.attachments}
                                updatedAt={articleDetail?.updatedAt}
                                lastRagSyncedAt={articleDetail?.lastRagSyncedAt}
                                isRagSynced={articleDetail?.isRagSynced}
                                mindMap={articleDetail?.mindMap}
                                tocLayout="inline"
                                mobileTocOpen={isMobileTocOpen}
                                onMobileTocClose={() => setIsMobileTocOpen(false)}
                                onTocAvailabilityChange={handleTocAvailabilityChange}
                            />
                        </div>
                    </div>
                ) : (
                    <OutlineContent
                        title={displayTitle}
                        description={anthologyInfo?.description}
                        icon={anthologyIcon}
                        docs={filteredDocs}
                        flatCount={flatDocs.length}
                        onSelectDoc={handleSelectDoc}
                        onBackHome={() => onNavigate && onNavigate('home')}
                    />
                )}
            </main>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #cbd5e1; }
            `}</style>
        </div>
    );
}
