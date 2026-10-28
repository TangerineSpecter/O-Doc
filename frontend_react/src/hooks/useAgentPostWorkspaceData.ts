import { type DiscussionEntry } from "../components/AgentWorld/SocialDiscussion";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getAgents, type AgentConfig } from "../api/setting";

import { isResourceNotFoundError } from "../utils/requestError";

import { useAgentPostReadTracking } from "./useAgentPostReadTracking";
import { useAgentPostIllustrationRefresh } from "./useAgentPostIllustrationRefresh";
import { AgentPostComment, AgentPostLatestCommentListResult, Article as ArticleType, createAgentPostComment, deleteArticle, getAgentPostLatestComments, getAgentPostComments, getArticleDetail, getArticles, rateAgentPost } from "../api/article";
import { useToast } from "../components/common/ToastProvider";

import type { AgentPostWorkspaceProps } from '../types/articleWorkspace';
export function useAgentPostWorkspaceData({collId, articleId, anthologyInfo, onNavigate, canManage}: AgentPostWorkspaceProps) {
    const canMigrate = canManage && anthologyInfo?.canManage === true;
    const [posts, setPosts] = useState<ArticleType[]>([]);
    const [loading, setLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ArticleType | null>(null);
    const [activePost, setActivePost] = useState<ArticleType | null>(null);
    const articleSession = useRef(0);
    const detailRequest = useRef(0);
    const listRequest = useRef(0);
    const listInFlight = useRef(false);
    const commentRevision = useRef(0);
    const commentReadRequest = useRef(0);
    const commentReadApplied = useRef(0);
    const commentWrites = useRef<Array<{revision: number; comment: AgentPostComment}>>([]);
    useEffect(() => () => {listRequest.current += 1; listInFlight.current = false;}, []);
    useEffect(() => {
        articleSession.current += 1;
        commentWrites.current = [];
        return () => {articleSession.current += 1;};
    }, [articleId]);
    const readPostIds = useRef(new Set<string>());
    const refreshPostPhoto = useCallback(() => {
        if (!articleId) return;
        void getArticleDetail(articleId).then(detail => setActivePost(current => current?.articleId === articleId ? {...current, content: detail.content, updatedAt: detail.updatedAt} : current)).catch(() => {});
    }, [articleId]);
    useAgentPostIllustrationRefresh(articleId, activePost, setActivePost);
    useAgentPostReadTracking(articleId, activePost, setActivePost);

    // 阅读状态变化时同步更新列表中的已读状态，确保返回列表时角标自然消除
    useEffect(() => {
        if (activePost?.articleId && activePost.agentPostHasBeenRead) {
            readPostIds.current.add(activePost.articleId);
            setPosts(prev => prev.map(p =>
                p.articleId === activePost.articleId && !p.agentPostHasBeenRead
                    ? {...p, agentPostHasBeenRead: true}
                    : p
            ));
        }
    }, [activePost?.articleId, activePost?.agentPostHasBeenRead]);
    const [postLoading, setPostLoading] = useState(false);
    const [postNotFound, setPostNotFound] = useState(false);
    const [postLoadError, setPostLoadError] = useState<unknown>(null);
    const [comments, setComments] = useState<AgentPostComment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [replyTarget, setReplyTarget] = useState<DiscussionEntry | null>(null);
    const [commentDraft, setCommentDraft] = useState('');
    const [commentSubmitting, setCommentSubmitting] = useState(false);
    const [activeCategory, setActiveCategory] = useState('all');
    const [searchKeyword, setSearchKeyword] = useState('');
    const [visibleCount, setVisibleCount] = useState(30);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [migrationTarget, setMigrationTarget] = useState<{oldCategory: string; postId?: string}>();
    const [ratingSubmitting, setRatingSubmitting] = useState(false);
    const [isRatingPickerOpen, setIsRatingPickerOpen] = useState(false);
    const [latestComments, setLatestComments] = useState<AgentPostLatestCommentListResult['comments']>([]);
    const [agentList, setAgentList] = useState<AgentConfig[]>([]);
    const toast = useToast();

    const includeCommentsPublishedSince = (comments: AgentPostComment[], revision: number) => {
        const ids = new Set(comments.map(comment => comment.commentId));
        const appended = commentWrites.current
            .filter(write => write.revision > revision && !ids.has(write.comment.commentId))
            .map(write => write.comment);
        return appended.length ? [...comments, ...appended] : comments;
    };

    useEffect(() => {
        getAgents().then(res => setAgentList((res as unknown as AgentConfig[]) || [])).catch(() => {});
    }, []);

    const activePostAgent = useMemo(() => {
        if (!activePost) return null;
        const cid = activePost.agentPostCreatorId || '';
        const cleanId = cid.replace(/^(agent-id:|agent:)/, '');
        return agentList.find(a => String(a.id) === cleanId || a.name === activePost.agentPostCreatorName) || null;
    }, [agentList, activePost]);

    const activePostProfession = activePost?.agentPostCreatorProfession || activePostAgent?.professionName || (activePostAgent as any)?.profession_name || null;

    const estimatedReadTime = useMemo(() => {
        if (!activePost) return 3;
        if (activePost.readTime && activePost.readTime > 0) return activePost.readTime;
        const charCount = (activePost.content || '').length;
        return Math.max(1, Math.ceil(charCount / 400));
    }, [activePost]);

    const categoryKey = (post: ArticleType) => post.agentPostCategoryId || `legacy:${post.agentPostCategory || ''}`;
    const categoryStats = posts.reduce<Array<{ key: string; name: string; oldCategory: string; pending: boolean; count: number }>>((acc, post) => {
        const key = categoryKey(post);
        const found = acc.find(item => item.key === key);
        if (found) found.count += 1;
        else acc.push({key, name: post.agentPostCategoryName || post.agentPostCategory || '未分类', oldCategory: post.agentPostCategory || '', pending: !post.agentPostCategoryId, count: 1});
        return acc;
    }, []);

    // 驻留创作的智能体列表去重
    const residentAgents = useMemo(() => {
        const map = new Map<string, { name: string; avatar?: string }>();
        posts.forEach(p => {
            const name = p.agentPostCreatorName || 'Agent';
            if (!map.has(name)) {
                map.set(name, { name, avatar: p.agentPostCreatorAvatar });
            }
        });
        return Array.from(map.values());
    }, [posts]);

    // 累计互动评论数
    const totalInteractionCount = useMemo(() => {
        return posts.reduce((sum, p) => sum + (p.postCommentCount || 0), 0);
    }, [posts]);

    // 综合平均评分
    const averageRating = useMemo(() => {
        const ratedPosts = posts.filter(p => typeof p.agentPostRating === 'number' && p.agentPostRating > 0);
        if (ratedPosts.length === 0) return null;
        const sum = ratedPosts.reduce((acc, p) => acc + (p.agentPostRating || 0), 0);
        return (sum / ratedPosts.length).toFixed(1);
    }, [posts]);

    // 分类 + 关键词过滤
    const filteredPosts = useMemo(() => {
        let list = activeCategory === 'all' ? posts : posts.filter(post => categoryKey(post) === activeCategory);
        if (searchKeyword.trim()) {
            const q = searchKeyword.trim().toLowerCase();
            list = list.filter(post => {
                const titleMatch = (post.title || '').toLowerCase().includes(q);
                const summaryMatch = (post.postSummary || post.content || '').toLowerCase().includes(q);
                const authorMatch = (post.agentPostCreatorName || '').toLowerCase().includes(q);
                return titleMatch || summaryMatch || authorMatch;
            });
        }
        return list;
    }, [posts, activeCategory, searchKeyword]);

    // 分页切片：首屏固定展示 30 条，下滑动态追加
    const visiblePosts = useMemo(() => {
        return filteredPosts.slice(0, visibleCount);
    }, [filteredPosts, visibleCount]);

    const hasMore = visiblePosts.length < filteredPosts.length;

    // 分类切换或搜索词变化时，重置分页到首屏 30
    useEffect(() => {
        setVisibleCount(30);
    }, [activeCategory, searchKeyword]);

    // 滚动监听加载更多（与首页文集列表行为一致）
    const handleScroll = useCallback(() => {
        if (isLoadingMore || !hasMore || articleId) return;
        const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;

        if (scrollTop + clientHeight >= scrollHeight - 200) {
            setIsLoadingMore(true);
            setTimeout(() => {
                setVisibleCount(prev => prev + 15);
                setIsLoadingMore(false);
            }, 300);
        }
    }, [isLoadingMore, hasMore, articleId]);

    useEffect(() => {
        window.addEventListener('scroll', handleScroll, {passive: true});
        return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // 底部视口观察器（对移动端下滑与触屏手势滚动更敏锐）
    useEffect(() => {
        if (!sentinelRef.current || !hasMore || isLoadingMore || articleId) return;
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting) {
                    setIsLoadingMore(true);
                    setTimeout(() => {
                        setVisibleCount(prev => prev + 15);
                        setIsLoadingMore(false);
                    }, 300);
                }
            },
            {rootMargin: '200px'}
        );
        observer.observe(sentinelRef.current);
        return () => observer.disconnect();
    }, [hasMore, isLoadingMore, articleId]);

    const loadPosts = useCallback(async () => {
        if (!collId) return false;
        const request = ++listRequest.current;
        const isCurrent = () => listRequest.current === request;
        listInFlight.current = true;
        setLoading(true);
        try {
            const [data, latestCommentResult] = await Promise.all([
                getArticles({collId}),
                getAgentPostLatestComments(collId, 10)
            ]);
            if (!isCurrent()) return false;
            // 世界入口会并行加载详情和列表；较晚返回的列表快照不能覆盖已确认的阅读状态。
            setPosts(data.map(post => readPostIds.current.has(post.articleId)
                ? {...post, agentPostHasBeenRead: true} : post
            ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLatestComments(latestCommentResult.comments || []);
            return true;
        } catch (error) {
            if (!isCurrent()) return false;
            console.error('加载 Agent 帖子失败:', error);
            toast.error('加载 Agent 帖子失败');
            return false;
        } finally {
            if (isCurrent()) {
                listInFlight.current = false;
                setLoading(false);
            }
        }
    }, [collId, toast]);

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            if (await loadPosts()) toast.success('已刷新最新帖子');
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadPosts();
    }, [loadPosts]);

    useEffect(() => {
        setReplyTarget(null);
        setCommentDraft('');
        setIsRatingPickerOpen(false);
        setCommentSubmitting(false);
        setRatingSubmitting(false);
    }, [articleId]);

    const loadPostDetail = useCallback(async () => {
        const request = ++detailRequest.current;
        const session = articleSession.current;
        const isCurrent = () => articleSession.current === session && detailRequest.current === request;
        setPostNotFound(false);
        setPostLoadError(null);
        setActivePost(null);
        setComments([]);
        if (!articleId) {
            setPostLoading(false);
            setCommentsLoading(false);
            return;
        }
        setPostLoading(true);
        setCommentsLoading(true);
        try {
            // 先确认帖子本身可读，再单独加载评论，避免评论接口失败被误判为帖子不存在
            const detail = await getArticleDetail(articleId);
            if (!isCurrent()) return;
            setActivePost(detail);
            const revision = commentRevision.current;
            const commentRequest = ++commentReadRequest.current;
            const commentResult = await getAgentPostComments(articleId).catch(() => null);
            if (!isCurrent()) return;
            if (commentResult && commentRequest > commentReadApplied.current) {
                commentReadApplied.current = commentRequest;
                setComments(includeCommentsPublishedSince(commentResult.comments, revision));
            }
        } catch (error) {
            if (!isCurrent()) return;
            console.error('加载 Agent 帖子详情失败:', error);
            setActivePost(null);
            setComments([]);
            if (isResourceNotFoundError(error)) {
                // 帖子已被删除或不可见：事件流等旧入口仍可能跳到这里
                setPostNotFound(true);
            } else {
                setPostLoadError(error);
                toast.error('加载帖子详情失败');
            }
        } finally {
            if (isCurrent()) {
                setPostLoading(false);
                setCommentsLoading(false);
            }
        }
    }, [articleId, toast]);

    useEffect(() => {
        loadPostDetail();
    }, [loadPostDetail]);

    useEffect(() => {
        if (!articleId) return;
        let active = true;
        const timer = window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            const revision = commentRevision.current;
            const session = articleSession.current;
            const commentRequest = ++commentReadRequest.current;
            void getAgentPostComments(articleId).then(result => {
                if (active && articleSession.current === session && commentRequest > commentReadApplied.current) {
                    commentReadApplied.current = commentRequest;
                    setComments(includeCommentsPublishedSince(result.comments, revision));
                }
            }).catch(() => {});
        }, 30000);
        return () => {active = false; window.clearInterval(timer);};
    }, [articleId]);

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
            if (listInFlight.current) void loadPosts();
        } catch (error) {
            console.error('删除 Agent 帖子失败:', error);
            toast.error(error instanceof Error ? error.message : '删除帖子失败');
        }
    };

    const handleSubmitComment = async () => {
        if (!activePost || !commentDraft.trim() || commentSubmitting) return;
        const session = articleSession.current;
        const isCurrent = () => articleSession.current === session;
        setCommentSubmitting(true);
        try {
            const result = await createAgentPostComment(activePost.articleId, commentDraft.trim(), replyTarget?.id, replyTarget?.actorId);
            if (isCurrent()) {
                commentWrites.current.push({revision: ++commentRevision.current, comment: result.comment});
                setComments(prev => prev.some(comment => comment.commentId === result.comment.commentId)
                    ? prev : [...prev, result.comment]);
            }
            if (isCurrent()) setActivePost(prev => prev?.articleId === activePost.articleId ? {
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
                agentName: result.comment.creatorName || '我',
                agentAvatar: result.comment.creatorAvatar || '',
                createdAt: result.comment.createdAt
            }, ...prev].slice(0, 10));
            if (isCurrent()) {
                setCommentDraft('');
                setReplyTarget(null);
                toast.success('评论已发布');
            }
            if (listInFlight.current) void loadPosts();
        } catch (error) {
            console.error('发布评论失败:', error);
            if (isCurrent()) toast.error(error instanceof Error ? error.message : '发布评论失败');
        } finally {
            if (isCurrent()) setCommentSubmitting(false);
        }
    };

    const handleRatePost = async (rating: number) => {
        if (!activePost || ratingSubmitting) return;
        const session = articleSession.current;
        const isCurrent = () => articleSession.current === session;
        setRatingSubmitting(true);
        try {
            const result = await rateAgentPost(activePost.articleId, rating);
            if (isCurrent()) setActivePost(prev => prev?.articleId === activePost.articleId ? {
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
            if (isCurrent()) toast.success('评分已保存');
            if (listInFlight.current) void loadPosts();
        } catch (error) {
            console.error('保存评分失败:', error);
            if (isCurrent()) toast.error(error instanceof Error ? error.message : '保存评分失败');
        } finally {
            if (isCurrent()) {
                setRatingSubmitting(false);
                setIsRatingPickerOpen(false);
            }
        }
    };

    
    return {canMigrate, posts, loading, deleteTarget, setDeleteTarget, activePost, refreshPostPhoto, postLoading, postNotFound, postLoadError, comments, commentsLoading, replyTarget, setReplyTarget, commentDraft, setCommentDraft, commentSubmitting, activeCategory, setActiveCategory, searchKeyword, setSearchKeyword, isLoadingMore, sentinelRef, refreshing, migrationTarget, setMigrationTarget, ratingSubmitting, isRatingPickerOpen, setIsRatingPickerOpen, latestComments, activePostProfession, estimatedReadTime, categoryStats, residentAgents, totalInteractionCount, averageRating, filteredPosts, visiblePosts, hasMore, loadPosts, handleRefresh, loadPostDetail, confirmDeletePost, handleSubmitComment, handleRatePost};
}

export type AgentPostWorkspaceData = ReturnType<typeof useAgentPostWorkspaceData>;
