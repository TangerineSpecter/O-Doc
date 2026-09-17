import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowUp, BookOpen, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Zap} from 'lucide-react';
import type {ReadingGraph, SourceEvidence} from '../../types/bookAnalysis';
import {
    clusterTimelineEvents,
    detectFlashback,
    getEventCausality,
    getPrimaryEvidence,
    getThreadTheme,
} from '../../utils/readingTimeline';

interface Props {
    graph: ReadingGraph;
    order: 'narrative' | 'time';
    selectedId: string;
    page: number;
    onPage: (page: number) => void;
    onSelect: (id: string) => void;
    onRead?: (source: SourceEvidence) => void;
    denseMode?: boolean;
}

export default function StoryTimeline({
    graph,
    order,
    selectedId,
    page,
    onPage,
    onSelect,
    onRead,
    denseMode: propDenseMode,
}: Props) {
    const denseMode = propDenseMode ?? false;
    const [expandedEvidences, setExpandedEvidences] = useState<Set<string>>(new Set());
    const [showUndated, setShowUndated] = useState(false);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
            setCanScrollUp(false);
        }
    }, [page, order]);

    const handleScroll = () => {
        if (scrollRef.current) {
            setCanScrollUp(scrollRef.current.scrollTop > 160);
        }
    };

    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({top: 0, behavior: 'smooth'});
        }
    };

    // 缓存节点快速查找表
    const nodesMap = useMemo(() => new Map(graph.nodes.map(n => [n.id, n])), [graph.nodes]);

    const groups = useMemo(() => clusterTimelineEvents(graph.nodes, order), [graph.nodes, order]);
    const undatedCount = groups.find(group => group.id === 'undated')?.nodes.length || 0;
    const visibleGroups = groups.filter(group => group.id !== 'undated' || showUndated);

    // 切换折叠展开某节点的证据
    const toggleEvidence = (nodeId: string) => {
        setExpandedEvidences(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    };

    const totalPages = Math.ceil(graph.total / graph.limit);

    if (!graph.nodes.length) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-400">
                    <Clock3 className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">当前范围暂无故事时间线</h3>
                <p className="mt-1 text-xs text-slate-400">请选择左侧更多章节或调整搜索关键词</p>
            </div>
        );
    }

    return (
        <section aria-label="故事事件时间线" className="space-y-3">
            <p className="px-1 text-xs text-slate-500">按原文明确日期排列；日期未明确的事件列在后面，不推断其发生顺序。</p>
            {undatedCount > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    <span>{groups.length === 1 ? '当前页没有可按日期排序的事件。' : '另有日期未明确的事件。'}{undatedCount} 个事件仅能按原文出现顺序查看。</span>
                    <button type="button" onClick={() => setShowUndated(value => !value)} className="font-semibold text-amber-800 hover:underline">
                        {showUndated ? '收起未定日期事件' : '展开未定日期事件'}
                    </button>
                </div>
            )}
            {/* 时间线主体容器 */}
            <div className="relative rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                {/* 限制最大高度并在内部滚动 */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="max-h-[600px] xl:max-h-[680px] overflow-y-auto overscroll-contain pr-2 sm:pr-3 space-y-8 scroll-smooth"
                >
                    {visibleGroups.map((group, groupIndex) => (
                        <div key={group.id} className="timeline-group">
                            {/* 阶段分组标题标尺 */}
                            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-100 text-[11px] font-bold text-orange-600">
                                        {groupIndex + 1}
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800">
                                        {group.title}
                                    </h3>
                                    {group.subtitle && group.subtitle !== group.title && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                                            {group.subtitle}
                                        </span>
                                    )}
                                </div>
                                <span className="text-[11px] text-slate-400">
                                    {group.nodes.length} 个事件
                                </span>
                            </div>

                            {/* 节点列表与纵向轴线 */}
                            <div className="relative space-y-4 pl-6 sm:pl-8">
                                {/* 纵向贯穿主轴线 */}
                                <div className="absolute bottom-2 left-2.5 top-3 w-0.5 bg-gradient-to-b from-orange-300 via-slate-200 to-slate-200 sm:left-3.5" />

                                {group.nodes.map((node, nodeIdx) => {
                                    const theme = getThreadTheme(node.thread);
                                    const evidence = getPrimaryEvidence(node);
                                    const causality = getEventCausality(node.id, graph.edges, nodesMap);
                                    const isFlashback = detectFlashback(nodeIdx, group.nodes, order);
                                    const isSelected = selectedId === node.id;
                                    const isExpanded = expandedEvidences.has(node.id);

                                    return (
                                        <article
                                            key={node.id}
                                            className="group relative"
                                        >
                                            {/* 轴线节点锚点 */}
                                            <div
                                                className={`absolute -left-6 top-3 flex h-5 w-5 -translate-x-0.5 items-center justify-center rounded-full bg-white shadow-sm transition-transform duration-200 group-hover:scale-125 sm:-left-8 sm:-translate-x-0 ${
                                                    isSelected
                                                        ? 'border-2 border-orange-500 ring-2 ring-orange-200'
                                                        : 'border-2'
                                                }`}
                                                style={{borderColor: isSelected ? '#f97316' : theme.dot}}
                                            >
                                                <span
                                                    className="h-1.5 w-1.5 rounded-full"
                                                    style={{background: isSelected ? '#f97316' : theme.dot}}
                                                />
                                            </div>

                                            {/* 卡片主体 */}
                                            <div
                                                className={`rounded-xl border p-3.5 sm:p-4 transition-all ${
                                                    isSelected
                                                        ? 'border-orange-400 bg-orange-50/30 ring-1 ring-orange-200 shadow-sm'
                                                        : 'border-slate-200 bg-white hover:border-orange-300 hover:shadow-md'
                                                }`}
                                            >
                                                {/* 卡片顶部：故事线、标题、时间胶囊 */}
                                                <div className="flex flex-wrap items-start justify-between gap-2">
                                                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                                        {node.thread && (
                                                            <span
                                                                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium ${theme.bg} ${theme.text} border ${theme.border}`}
                                                            >
                                                                <span
                                                                    className="h-1.5 w-1.5 rounded-full"
                                                                    style={{background: theme.dot}}
                                                                />
                                                                {node.thread}
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelect(node.id)}
                                                            className="text-left text-xs sm:text-sm font-bold text-slate-800 transition-colors hover:text-orange-600 focus-visible:outline-none focus-visible:text-orange-600"
                                                        >
                                                            {node.name}
                                                        </button>
                                                        {isFlashback && (
                                                            <span className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                                                                原著倒叙提及
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* 高亮时间胶囊 */}
                                                    <div className="shrink-0">
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-orange-100 bg-orange-50/80 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600 shadow-xs">
                                                            <Clock3 className="h-3 w-3 text-orange-500" />
                                                            <span>{node.timeLabel || '时间未明确'}</span>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* 事实描述正文 */}
                                                {node.facts[0]?.description && (
                                                    <p
                                                        className={`mt-2 text-xs leading-relaxed text-slate-600 ${
                                                            denseMode ? 'line-clamp-1' : 'line-clamp-3'
                                                        }`}
                                                    >
                                                        {node.facts[0].description}
                                                    </p>
                                                )}

                                                {/* 因果承接指示 */}
                                                {(causality.causes || causality.causedBy) && (
                                                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                                        {causality.causedBy && (
                                                            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">
                                                                <span className="text-slate-400">承接自:</span>
                                                                <span className="font-medium text-slate-700">{causality.causedBy.name}</span>
                                                            </span>
                                                        )}
                                                        {causality.causes && (
                                                            <span className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50/80 px-2 py-0.5 text-[10px] text-orange-800">
                                                                <Zap className="h-2.5 w-2.5 text-orange-500" />
                                                                <span className="font-medium">导致: {causality.causes.name}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* 底部元数据栏与操作 */}
                                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px]">
                                                    <div className="flex flex-wrap items-center gap-2 text-slate-400">
                                                        {evidence?.chapterTitle && (
                                                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                                                第 {evidence.ordinal} 章 · {evidence.chapterTitle}
                                                            </span>
                                                        )}
                                                        {node.aliases && node.aliases.length > 0 && (
                                                            <span className="text-[10px] text-slate-400">
                                                                别名: {node.aliases.slice(0, 2).join(', ')}
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        {/* 原地折叠展开证据 */}
                                                        {evidence?.quote && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleEvidence(node.id)}
                                                                className="inline-flex items-center gap-1 font-medium text-orange-600 hover:text-orange-700 transition-colors"
                                                            >
                                                                <span>{isExpanded ? '收起证据' : '查看证据'}</span>
                                                                {isExpanded ? (
                                                                    <ChevronUp className="h-3 w-3" />
                                                                ) : (
                                                                    <ChevronDown className="h-3 w-3" />
                                                                )}
                                                            </button>
                                                        )}

                                                        {/* 查看对象详情抽屉 */}
                                                        <button
                                                            type="button"
                                                            onClick={() => onSelect(node.id)}
                                                            className="text-slate-400 hover:text-slate-600 transition-colors"
                                                        >
                                                            详情 &gt;
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* 原地展开的原文证据卡片 */}
                                                {isExpanded && evidence && (
                                                    <div className="mt-3 rounded-lg border border-orange-100 bg-orange-50/40 p-3 text-[11px] leading-relaxed text-slate-600 animate-in fade-in duration-150">
                                                        <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                                                            <span className="font-medium text-slate-500">
                                                                原著证据（第 {evidence.ordinal} 章）
                                                            </span>
                                                            {onRead && evidence.locator && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onRead(evidence)}
                                                                    className="inline-flex items-center gap-1 text-orange-600 hover:underline"
                                                                >
                                                                    <BookOpen className="h-3 w-3" />
                                                                    <span>阅读原文对应段落</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                        <blockquote className="border-l-2 border-orange-400 pl-2.5 italic text-slate-700">
                                                            “{evidence.quote}”
                                                        </blockquote>
                                                    </div>
                                                )}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 悬浮返回顶部按钮 */}
                {canScrollUp && (
                    <button
                        type="button"
                        onClick={scrollToTop}
                        aria-label="返回时间轴顶部"
                        title="返回时间轴顶部"
                        className="absolute bottom-16 right-5 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-md backdrop-blur-sm transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
                    >
                        <ArrowUp className="h-4 w-4" />
                    </button>
                )}

                {/* 分页控制器（固定在滚动框外底部） */}
                {graph.total > graph.limit && (
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <button
                            type="button"
                            disabled={page === 1}
                            onClick={() => onPage(page - 1)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>上一页</span>
                        </button>
                        <span className="text-slate-400">
                            第 {page} 页 / 共 {totalPages} 页
                        </span>
                        <button
                            type="button"
                            disabled={page * graph.limit >= graph.total}
                            onClick={() => onPage(page + 1)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                        >
                            <span>下一页</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
