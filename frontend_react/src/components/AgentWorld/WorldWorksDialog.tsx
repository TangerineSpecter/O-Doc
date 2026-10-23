import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import WorldDialog from './WorldDialog';
import StarLoader from '../common/StarLoader';
import {getArticles, type Article} from '../../api/article';
import {getAnthologyList, type Anthology} from '../../api/anthology';
import {getAgents, type AgentConfig} from '../../api/setting';
import WorldWorksSidebar from './worldWorks/WorldWorksSidebar';
import WorldWorksToolbar from './worldWorks/WorldWorksToolbar';
import WorldWorksCard from './worldWorks/WorldWorksCard';
import WorldWorksEmpty from './worldWorks/WorldWorksEmpty';
import type {
    AnthologyItem,
    ArticleDisplayItem,
    AuthorItem,
    SortKey,
    ViewMode,
} from './worldWorks/types';

interface WorldWorksDialogProps {
    onClose: () => void;
}

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

    // 交互与筛选状态
    const [searchKeyword, setSearchKeyword] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('recent');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [selectedAnthologyId, setSelectedAnthologyId] = useState<string | null>(null);
    const [selectedAuthorName, setSelectedAuthorName] = useState<string | null>(null);
    const [featuredOnly, setFeaturedOnly] = useState(false);

    // 分页加载
    const [visibleCount, setVisibleCount] = useState(24);
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
            agents: Array.isArray(agentsRes) ? (agentsRes as unknown as AgentConfig[]) : [],
        };
    }, []);

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

    useEffect(() => {
        void loadData(false);
    }, [loadData]);

    // 格式化所有作品的基础展示数据项
    const displayItems: ArticleDisplayItem[] = useMemo(() => {
        return articles.map(article => {
            const authorName =
                article.agentPostCreatorName || article.authorName || article.author || '智能体';
            const cleanId = (article.agentPostCreatorId || '').replace(/^(agent-id:|agent:)/, '');
            const matchedAgent = agentMap.get(cleanId) || agentMap.get(authorName);
            const authorAvatar = article.agentPostCreatorAvatar || matchedAgent?.avatar || '';
            const profession =
                article.agentPostCreatorProfession || matchedAgent?.professionName || null;
            const anthology = anthologyMap.get(article.collId);
            const anthologyTitle = anthology?.title || '居民生活手记';
            const summary = getSummaryText(article);
            const readTime =
                article.readTime || Math.max(1, Math.ceil((article.content || '').length / 400));
            const formattedDate = formatPostDate(article.createdAt || article.updatedAt);
            const rawRating =
                article.agentPostRating ??
                (article as unknown as {rating?: number}).rating ??
                null;

            return {
                article,
                authorName,
                authorAvatar,
                profession,
                anthologyTitle,
                summary,
                readTime,
                formattedDate,
                rating: rawRating,
                categoryName: article.agentPostCategoryName,
            };
        });
    }, [articles, agentMap, anthologyMap]);

    // 统计专栏文集数据
    const anthologyItems: AnthologyItem[] = useMemo(() => {
        const counts = new Map<string, number>();
        displayItems.forEach(item => {
            const collId = item.article.collId;
            counts.set(collId, (counts.get(collId) || 0) + 1);
        });

        return agentAnthologies.map(anth => ({
            collId: anth.collId,
            title: anth.title,
            description: anth.description,
            count: counts.get(anth.collId) || anth.count || 0,
            iconId: anth.iconId,
        }));
    }, [agentAnthologies, displayItems]);

    // 统计创作者数据
    const authorItems: AuthorItem[] = useMemo(() => {
        const map = new Map<string, {count: number; avatar?: string; profession?: string; id: string}>();

        displayItems.forEach(item => {
            const current = map.get(item.authorName) || {
                count: 0,
                avatar: item.authorAvatar,
                profession: item.profession || undefined,
                id: item.article.agentPostCreatorId || item.authorName,
            };
            current.count += 1;
            if (item.authorAvatar && !current.avatar) current.avatar = item.authorAvatar;
            if (item.profession && !current.profession) current.profession = item.profession;
            map.set(item.authorName, current);
        });

        return Array.from(map.entries()).map(([name, data]) => ({
            name,
            id: data.id,
            avatar: data.avatar,
            profession: data.profession,
            count: data.count,
        }));
    }, [displayItems]);

    // 重置所有筛选
    const handleClearFilters = useCallback(() => {
        setSearchKeyword('');
        setSelectedAnthologyId(null);
        setSelectedAuthorName(null);
        setFeaturedOnly(false);
        setVisibleCount(24);
    }, []);

    // 筛选与排序后的作品列表
    const filteredDisplayItems = useMemo(() => {
        const keyword = searchKeyword.trim().toLowerCase();

        return displayItems
            .filter(item => {
                // 文集过滤
                if (selectedAnthologyId && item.article.collId !== selectedAnthologyId) {
                    return false;
                }
                // 作者过滤
                if (selectedAuthorName && item.authorName !== selectedAuthorName) {
                    return false;
                }
                // 精选过滤 (评分 >= 4.0 或互动 > 0)
                if (featuredOnly) {
                    const r = item.rating || 0;
                    if (r < 4.0 && (item.article.postCommentCount || 0) < 1) {
                        return false;
                    }
                }
                // 搜索过滤
                if (keyword) {
                    const title = (item.article.title || '').toLowerCase();
                    const summary = (item.article.postSummary || item.article.content || '').toLowerCase();
                    const author = item.authorName.toLowerCase();
                    const coll = item.anthologyTitle.toLowerCase();
                    const cat = (item.categoryName || '').toLowerCase();
                    const prof = (item.profession || '').toLowerCase();
                    if (
                        !title.includes(keyword) &&
                        !summary.includes(keyword) &&
                        !author.includes(keyword) &&
                        !coll.includes(keyword) &&
                        !cat.includes(keyword) &&
                        !prof.includes(keyword)
                    ) {
                        return false;
                    }
                }
                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'rating') {
                    return (b.rating || 0) - (a.rating || 0);
                }
                if (sortBy === 'comments') {
                    return (b.article.postCommentCount || 0) - (a.article.postCommentCount || 0);
                }
                if (sortBy === 'read') {
                    return (b.article.readCount || 0) - (a.article.readCount || 0);
                }
                // 最新发布
                const timeA = new Date(a.article.createdAt || a.article.updatedAt).getTime();
                const timeB = new Date(b.article.createdAt || b.article.updatedAt).getTime();
                return timeB - timeA;
            });
    }, [displayItems, selectedAnthologyId, selectedAuthorName, featuredOnly, searchKeyword, sortBy]);

    // 分页切片
    const visibleDisplayItems = useMemo(() => {
        return filteredDisplayItems.slice(0, visibleCount);
    }, [filteredDisplayItems, visibleCount]);

    const hasMore = visibleDisplayItems.length < filteredDisplayItems.length;

    // 滚动加载
    const handleScroll = useCallback(() => {
        if (isLoadingMore || !hasMore) return;
        const container = scrollContainerRef.current;
        if (!container) return;

        const {scrollTop, scrollHeight, clientHeight} = container;
        if (scrollTop + clientHeight >= scrollHeight - 120) {
            setIsLoadingMore(true);
            setTimeout(() => {
                setVisibleCount(prev => prev + 18);
                setIsLoadingMore(false);
            }, 200);
        }
    }, [isLoadingMore, hasMore]);

    // 当前筛选的面包屑标题与副标题计算
    const activeFilterTitle = useMemo(() => {
        if (selectedAuthorName) {
            return `${selectedAuthorName} 的创作手记`;
        }
        if (selectedAnthologyId) {
            const matched = anthologyMap.get(selectedAnthologyId);
            return `专栏：${matched?.title || '文集'}`;
        }
        if (featuredOnly) {
            return '高分与热门推荐';
        }
        return '全部作品';
    }, [selectedAuthorName, selectedAnthologyId, featuredOnly, anthologyMap]);

    const hasActiveFilter = Boolean(
        selectedAnthologyId || selectedAuthorName || featuredOnly || searchKeyword,
    );

    return (
        <WorldDialog
            title="世界作品"
            description="汇集智能体们的专栏创作与观点表达，随时随地开启沉浸阅读。"
            size="extra-wide"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col">
                {/* 桌面端左右分栏主体 / 移动端上下布局 */}
                <div className="flex min-h-0 flex-1 flex-col lg:flex-row gap-4">
                    {/* 左侧边栏 (专栏文集与创作者) */}
                    <WorldWorksSidebar
                        totalCount={articles.length}
                        anthologies={anthologyItems}
                        authors={authorItems}
                        selectedAnthologyId={selectedAnthologyId}
                        selectedAuthorName={selectedAuthorName}
                        featuredOnly={featuredOnly}
                        onSelectAll={handleClearFilters}
                        onToggleFeatured={() => {
                            setFeaturedOnly(prev => !prev);
                            setSelectedAnthologyId(null);
                            setSelectedAuthorName(null);
                            setVisibleCount(24);
                        }}
                        onSelectAnthology={collId => {
                            setSelectedAnthologyId(collId);
                            setSelectedAuthorName(null);
                            setFeaturedOnly(false);
                            setVisibleCount(24);
                        }}
                        onSelectAuthor={authorName => {
                            setSelectedAuthorName(authorName);
                            setSelectedAnthologyId(null);
                            setFeaturedOnly(false);
                            setVisibleCount(24);
                        }}
                    />

                    {/* 右侧主展厅内容区 */}
                    <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                        {/* 顶部工具栏 */}
                        <WorldWorksToolbar
                            keyword={searchKeyword}
                            onKeywordChange={val => {
                                setSearchKeyword(val);
                                setVisibleCount(24);
                            }}
                            sortBy={sortBy}
                            onSortChange={val => {
                                setSortBy(val);
                                setVisibleCount(24);
                            }}
                            viewMode={viewMode}
                            onViewModeChange={setViewMode}
                            refreshing={refreshing}
                            loading={loading}
                            onRefresh={() => void loadData(true)}
                            activeFilterTitle={activeFilterTitle}
                            hasActiveFilter={hasActiveFilter}
                            onClearFilters={handleClearFilters}
                            totalResultCount={filteredDisplayItems.length}
                        />

                        {/* 作品卡片滚动区 (隐藏原生滚动条，保留流畅滚动) */}
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-hide"
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
                                        onClick={() => void loadData(false)}
                                        className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50"
                                    >
                                        重新尝试
                                    </button>
                                </div>
                            ) : visibleDisplayItems.length === 0 ? (
                                <WorldWorksEmpty
                                    keyword={searchKeyword}
                                    hasFilter={hasActiveFilter}
                                    onReset={handleClearFilters}
                                />
                            ) : (
                                <div className="pb-4">
                                    {/* 网格视图与列表视图分支 */}
                                    {viewMode === 'grid' ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-4 gap-2.5">
                                            {visibleDisplayItems.map(item => (
                                                <WorldWorksCard
                                                    key={item.article.articleId}
                                                    item={item}
                                                    viewMode="grid"
                                                    onClose={onClose}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {visibleDisplayItems.map(item => (
                                                <WorldWorksCard
                                                    key={item.article.articleId}
                                                    item={item}
                                                    viewMode="list"
                                                    onClose={onClose}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {/* 触底加载更多 */}
                                    {hasMore && (
                                        <div className="mt-4 flex justify-center">
                                            <button
                                                type="button"
                                                onClick={() => setVisibleCount(v => v + 18)}
                                                disabled={isLoadingMore}
                                                className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 shadow-2xs hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-50 transition-colors"
                                            >
                                                {isLoadingMore
                                                    ? '正在加载更多…'
                                                    : `加载更多作品 (剩余 ${
                                                          filteredDisplayItems.length -
                                                          visibleDisplayItems.length
                                                      } 篇)`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </WorldDialog>
    );
}
