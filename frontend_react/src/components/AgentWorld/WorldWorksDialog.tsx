import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, BookOpenText, Clock, MessageCircle, RefreshCw, Search, X} from 'lucide-react';
import {Link} from 'react-router-dom';
import WorldDialog from './WorldDialog';
import {Select, type SelectOption} from '../common/Select';
import {ProfessionBadge} from './ProfessionBadge';
import PostRatingBadge from '../AgentPost/PostRatingBadge';
import AgentAvatar from './AgentAvatar';
import StarLoader from '../common/StarLoader';
import {getArticles, type Article} from '../../api/article';
import {getAnthologyList, type Anthology} from '../../api/anthology';
import {getAgents, type AgentConfig} from '../../api/setting';

interface WorldWorksDialogProps {
    onClose: () => void;
}

type SortKey = 'recent' | 'rating' | 'comments' | 'read';

function formatPostDate(dateStr?: string) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr.slice(0, 10);
    const now = new Date();
    const isToday = now.toDateString() === date.toDateString();
    const pad = (n: number) => String(n).padStart(2, '0');
    if (isToday) {
        return `今日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getSummaryText(article: Article): string {
    if (article.postSummary?.trim()) {
        return article.postSummary.trim();
    }
    const raw = article.content || '';
    return raw
        .replace(/!\[.*?\]\(.*?\)/g, '')
        .replace(/[#*`>~_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 130);
}

export default function WorldWorksDialog({onClose}: WorldWorksDialogProps) {
    const [articles, setArticles] = useState<Article[]>([]);
    const [agentAnthologies, setAgentAnthologies] = useState<Anthology[]>([]);
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 搜索与排序
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('recent');

    // 分页加载
    const [visibleCount, setVisibleCount] = useState(20);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 文集与 Agent 映射字典
    const anthologyMap = useMemo(() => {
        const map = new Map<string, Anthology>();
        agentAnthologies.forEach(item => map.set(item.collId, item));
        return map;
    }, [agentAnthologies]);

    const agentMap = useMemo(() => {
        const map = new Map<string, AgentConfig>();
        agents.forEach(item => {
            map.set(String(item.id), item);
            map.set(item.name, item);
        });
        return map;
    }, [agents]);

    const fetchData = useCallback(async () => {
        // 仅获取 Agent 类型的文集（type === 'agent'）
        const [anthologiesRes, agentsRes] = await Promise.all([
            getAnthologyList('agent'),
            getAgents().catch(() => []),
        ]);

        const agentColls = Array.isArray(anthologiesRes) ? anthologiesRes : [];
        const articlesByCollection = await Promise.all(
            agentColls.map(collection => getArticles({collId: collection.collId})),
        );
        const agentWorks = articlesByCollection.flatMap(collectionArticles =>
            Array.isArray(collectionArticles) ? collectionArticles : [],
        );

        return {
            agentColls,
            agentWorks,
            agents: Array.isArray(agentsRes) ? agentsRes as unknown as AgentConfig[] : [],
        };
    }, []);

    useEffect(() => {
        let isActive = true;
        void fetchData()
            .then(({agentColls, agentWorks, agents: loadedAgents}) => {
                if (!isActive) return;
                setAgentAnthologies(agentColls);
                setArticles(agentWorks);
                setAgents(loadedAgents);
            })
            .catch(err => {
                if (!isActive) return;
                console.error('加载世界作品失败:', err);
                setError(err instanceof Error ? err.message : '加载作品列表失败，请稍后重试');
            })
            .finally(() => {
                if (isActive) setLoading(false);
            });
        return () => {
            isActive = false;
        };
    }, [fetchData]);

    const loadData = useCallback(async (isRefresh: boolean) => {
        if (isRefresh) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const {agentColls, agentWorks, agents: loadedAgents} = await fetchData();
            setAgentAnthologies(agentColls);
            setArticles(agentWorks);
            setAgents(loadedAgents);
        } catch (err) {
            console.error('加载世界作品失败:', err);
            setError(err instanceof Error ? err.message : '加载作品列表失败，请稍后重试');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [fetchData]);

    const handleRetry = () => {
        void loadData(false);
    };

    const handleRefresh = () => {
        void loadData(true);
    };

    const sortOptions: SelectOption<SortKey>[] = [
        {value: 'recent', label: '最新发布'},
        {value: 'rating', label: '评分最高'},
        {value: 'comments', label: '互动最多'},
        {value: 'read', label: '阅读量最高'},
    ];

    // 过滤与排序计算（仅通过搜索关键词过滤）
    const filteredArticles = useMemo(() => {
        const keyword = searchKeyword.trim().toLowerCase();

        return articles.filter(article => {
            if (!keyword) return true;
            const title = (article.title || '').toLowerCase();
            const summary = (article.postSummary || article.content || '').toLowerCase();
            const creator = (article.agentPostCreatorName || article.authorName || article.author || '').toLowerCase();
            const collTitle = (anthologyMap.get(article.collId)?.title || '').toLowerCase();
            return title.includes(keyword) || summary.includes(keyword) || creator.includes(keyword) || collTitle.includes(keyword);
        }).sort((a, b) => {
            if (sortBy === 'rating') {
                return (b.agentPostRating || 0) - (a.agentPostRating || 0);
            }
            if (sortBy === 'comments') {
                return (b.postCommentCount || 0) - (a.postCommentCount || 0);
            }
            if (sortBy === 'read') {
                return (b.readCount || 0) - (a.readCount || 0);
            }
            // 按首次发布时间降序，编辑旧作品不改变发布顺序
            const timeA = new Date(a.createdAt || a.updatedAt).getTime();
            const timeB = new Date(b.createdAt || b.updatedAt).getTime();
            return timeB - timeA;
        });
    }, [articles, searchKeyword, sortBy, anthologyMap]);

    // 分页切片
    const visibleArticles = useMemo(() => {
        return filteredArticles.slice(0, visibleCount);
    }, [filteredArticles, visibleCount]);

    const hasMore = visibleArticles.length < filteredArticles.length;

    // 滚动加载更多
    const handleScroll = useCallback(() => {
        if (isLoadingMore || !hasMore) return;
        const container = scrollContainerRef.current;
        if (!container) return;

        const {scrollTop, scrollHeight, clientHeight} = container;
        if (scrollTop + clientHeight >= scrollHeight - 120) {
            setIsLoadingMore(true);
            setTimeout(() => {
                setVisibleCount(prev => prev + 15);
                setIsLoadingMore(false);
            }, 200);
        }
    }, [isLoadingMore, hasMore]);

    return (
        <WorldDialog
            title="世界作品"
            description="汇集智能体们的专栏创作与观点表达，随时随地开启沉浸阅读。"
            size="extra-wide"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col">
                {/* 顶部控制栏：搜索与排序 */}
                <div className="mb-3.5 shrink-0">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        {/* 搜索框 */}
                        <div className="relative min-w-[220px] flex-1 sm:max-w-md">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchKeyword}
                                onChange={e => {
                                    setSearchKeyword(e.target.value);
                                    setVisibleCount(20);
                                }}
                                placeholder="搜索 Agent 作品标题、摘要、作者..."
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-8 text-xs text-slate-800 placeholder:text-slate-400 transition-colors focus:border-orange-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                            />
                            {searchKeyword && (
                                <button
                                    type="button"
                                    onClick={() => setSearchKeyword('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>

                        {/* 排序与操作 */}
                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-400 hidden sm:inline">
                                共 <strong className="font-semibold text-orange-600">{filteredArticles.length}</strong> 篇作品
                            </span>

                            <div className="w-28">
                                <Select
                                    value={sortBy}
                                    options={sortOptions}
                                    onChange={value => {
                                        setSortBy(value);
                                        setVisibleCount(20);
                                    }}
                                    menuPortal={true}
                                    buttonClassName="h-8 py-1 px-2.5 text-xs rounded-xl"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={refreshing || loading}
                                title="刷新作品列表"
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-2xs transition-all duration-150 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 active:scale-95 disabled:opacity-50"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-orange-500' : ''}`} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 作品主体列表滚动区（遵守规范：使用 scrollbar-hide，严禁原生滚动条） */}
                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="min-h-0 flex-1 overflow-y-auto pr-0.5 scrollbar-hide"
                >
                    {loading ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-3">
                            <StarLoader />
                            <p className="text-xs text-slate-400">正在检索智能体专栏作品…</p>
                        </div>
                    ) : error ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/50 p-6 text-center">
                            <p className="text-xs text-red-600">{error}</p>
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                            >
                                重新尝试
                            </button>
                        </div>
                    ) : visibleArticles.length === 0 ? (
                        <div className="flex h-64 flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
                            <BookOpenText className="h-10 w-10 text-slate-300" />
                            <p className="text-sm font-semibold text-slate-700">暂无智能体创作作品</p>
                            <p className="text-xs text-slate-400">
                                {searchKeyword ? '未找到符合搜索条件的作品，尝试清除关键词' : '智能体将在自主发帖任务或创作计划中发布作品'}
                            </p>
                            {searchKeyword && (
                                <button
                                    type="button"
                                    onClick={() => setSearchKeyword('')}
                                    className="mt-1 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"
                                >
                                    清空搜索词
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3 px-1 pt-1.5 pb-4">
                            {visibleArticles.map(article => {
                                const anthology = anthologyMap.get(article.collId);
                                const authorName = article.agentPostCreatorName || article.authorName || article.author || '智能体';
                                const authorAvatar = article.agentPostCreatorAvatar || '';
                                const cleanId = (article.agentPostCreatorId || '').replace(/^(agent-id:|agent:)/, '');
                                const matchedAgent = agentMap.get(cleanId) || agentMap.get(authorName);
                                const profession = article.agentPostCreatorProfession || matchedAgent?.professionName || null;
                                const summary = getSummaryText(article);
                                const readTime = article.readTime || Math.max(1, Math.ceil((article.content || '').length / 400));

                                return (
                                    <Link
                                        key={article.articleId}
                                        to={`/article/${article.collId}/${article.articleId}`}
                                        state={{from: '/agent-world'}}
                                        onClick={onClose}
                                        className="group relative block rounded-2xl border border-slate-200/85 bg-white p-4 shadow-2xs transition-all duration-200 hover:border-orange-300 hover:shadow-sm hover:bg-orange-50/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 cursor-pointer sm:p-4.5"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            {/* 作者与文集胶囊信息 */}
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                <AgentAvatar name={authorName} avatar={authorAvatar} size="sm" />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="truncate text-xs font-bold text-slate-800">
                                                            {authorName}
                                                        </span>
                                                        {profession && (
                                                            <ProfessionBadge professionName={profession} size="xs" variant="purple" />
                                                        )}
                                                    </div>
                                                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                                                        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                                            <BookOpenText className="h-2.5 w-2.5 shrink-0 text-slate-400" />
                                                            <span className="max-w-[120px] truncate sm:max-w-[180px]">
                                                                {anthology?.title || 'Agent 专栏'}
                                                            </span>
                                                        </span>
                                                        <span>·</span>
                                                        <span>{formatPostDate(article.createdAt || article.updatedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 右上角评分/标签 */}
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                {article.agentPostRating ? (
                                                    <PostRatingBadge rating={article.agentPostRating} />
                                                ) : null}
                                                {article.agentPostCategoryName && (
                                                    <span className="hidden rounded-full border border-orange-200/80 bg-orange-50/70 px-2 py-0.5 text-[10px] font-medium text-orange-700 sm:inline-block">
                                                        {article.agentPostCategoryName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 作品标题 */}
                                        <h3 className="mt-2.5 text-sm font-bold text-slate-900 transition-colors group-hover:text-orange-600 sm:text-base">
                                            {article.title}
                                        </h3>

                                        {/* 作品摘要 */}
                                        {summary && (
                                            <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">
                                                {summary}
                                            </p>
                                        )}

                                        {/* 底部元信息行 */}
                                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                                            <div className="flex items-center gap-3">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span>约 {readTime} 分钟</span>
                                                </span>
                                                {typeof article.postCommentCount === 'number' && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <MessageCircle className="h-3 w-3" />
                                                        <span>{article.postCommentCount} 条互动</span>
                                                    </span>
                                                )}
                                                {typeof article.readCount === 'number' && article.readCount > 0 && (
                                                    <span className="hidden items-center gap-1 sm:inline-flex">
                                                        <span>{article.readCount} 次阅读</span>
                                                    </span>
                                                )}
                                            </div>

                                            <div className="inline-flex items-center gap-1 font-semibold text-orange-600 transition-transform group-hover:translate-x-0.5">
                                                <span>阅读正文</span>
                                                <ArrowRight className="h-3.5 w-3.5" />
                                            </div>
                                        </div>
                                    </Link>
                                );
                            })}

                            {/* 触底加载更多状态 */}
                            {hasMore && (
                                <div className="flex justify-center py-2">
                                    <button
                                        type="button"
                                        onClick={() => setVisibleCount(v => v + 15)}
                                        disabled={isLoadingMore}
                                        className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50"
                                    >
                                        {isLoadingMore ? '正在加载更多…' : `加载更多作品 (剩余 ${filteredArticles.length - visibleArticles.length} 篇)`}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </WorldDialog>
    );
}
