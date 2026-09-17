import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowRight, ArrowUp, ChevronDown, ChevronRight, Layers, X, Zap} from 'lucide-react';
import type {ReadingGraph} from '../../types/bookAnalysis';
import {getThreadTheme} from '../../utils/readingTimeline';
import {clusterNodesByChapter, traceCausalityNetwork} from '../../utils/storyFlow';

interface Props {
    graph: ReadingGraph;
    order: 'narrative' | 'time';
    selectedId: string;
    onSelect: (id: string) => void;
    denseMode?: boolean;
}

export default function StoryFlowCanvas({graph, order, selectedId, onSelect, denseMode = false}: Props) {
    const [collapsedChapterIds, setCollapsedChapterIds] = useState<Set<string>>(new Set());
    const [tracingNodeId, setTracingNodeId] = useState<string | null>(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // 章节平滑聚类
    const chapterGroups = useMemo(() => {
        return clusterNodesByChapter(graph.nodes, order);
    }, [graph.nodes, order]);

    // 计算因果链追踪高亮网络
    const traceResult = useMemo(() => {
        if (!tracingNodeId) return null;
        return traceCausalityNetwork(tracingNodeId, graph.edges);
    }, [tracingNodeId, graph.edges]);

    const activeTraceNode = useMemo(() => {
        if (!tracingNodeId) return null;
        return graph.nodes.find(n => n.id === tracingNodeId) || null;
    }, [tracingNodeId, graph.nodes]);

    // 监听滚动位置控制“回到顶部”按钮
    const handleScroll = () => {
        if (scrollRef.current) {
            setCanScrollUp(scrollRef.current.scrollTop > 180);
        }
    };

    const scrollToTop = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({top: 0, behavior: 'smooth'});
        }
    };

    const scrollToChapter = (chapterId: string) => {
        const chapter = document.getElementById(`chapter-card-${chapterId}`);
        if (chapter && scrollRef.current?.contains(chapter)) {
            scrollRef.current.scrollTo({top: chapter.getBoundingClientRect().top - scrollRef.current.getBoundingClientRect().top + scrollRef.current.scrollTop, behavior: 'smooth'});
        }
    };

    // 切换单章展开/折叠
    const toggleChapter = (chapterId: string) => {
        setCollapsedChapterIds(prev => {
            const next = new Set(prev);
            if (next.has(chapterId)) {
                next.delete(chapterId);
            } else {
                next.add(chapterId);
            }
            return next;
        });
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
            setCanScrollUp(false);
        }
    }, [order]);

    if (!graph.nodes.length) {
        return (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-400">
                    <Layers className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold text-slate-700">当前范围暂无情节流程</h3>
                <p className="mt-1 text-xs text-slate-400">请调整左侧章节选择或搜索条件</p>
            </div>
        );
    }

    return (
        <section aria-label="故事情节流程分段流" className="space-y-3">
            {/* 主体分段看板容器 (限制高度内滚动) */}
            <div className="relative rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                {/* 因果追踪激活时的轻量提示条 */}
                {tracingNodeId && activeTraceNode && (
                    <div className="mb-4 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50/90 px-3 py-2 text-xs text-orange-800 animate-in fade-in duration-150">
                        <div className="flex items-center gap-2">
                            <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                            <span>
                                正在追踪因果：<strong>{activeTraceNode.name}</strong>
                                <span className="text-[11px] text-orange-700 ml-1">
                                    (关联 {traceResult?.relatedNodeIds.size || 1} 个前后事件，其余已虚化)
                                </span>
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setTracingNodeId(null)}
                            className="inline-flex items-center gap-1 text-[11px] text-orange-700 hover:underline font-medium"
                        >
                            <X className="h-3.5 w-3.5" />
                            <span>退出追踪</span>
                        </button>
                    </div>
                )}

                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="max-h-[620px] xl:max-h-[700px] overflow-y-auto overscroll-contain pr-1 sm:pr-2 space-y-6 scroll-smooth"
                >
                    {chapterGroups.map((group, groupIdx) => {
                        const isCollapsed = collapsedChapterIds.has(group.id);
                        const nextGroup = chapterGroups[groupIdx + 1];

                        return (
                            <section
                                key={group.id}
                                id={`chapter-card-${group.id}`}
                                className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs transition-all hover:border-slate-300"
                            >
                                {/* 章节卡片箱头部 */}
                                <div
                                    onClick={() => toggleChapter(group.id)}
                                    className="flex cursor-pointer select-none items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3 hover:bg-slate-100/60 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-500 text-xs font-bold text-white shadow-xs">
                                            {group.ordinal || groupIdx + 1}
                                        </span>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-slate-800 text-xs sm:text-sm">
                                                    {group.title}
                                                </h3>
                                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                                    {group.nodes.length} 个情节
                                                </span>
                                            </div>
                                            {group.subtitle && (
                                                <p className="mt-0.5 text-[11px] text-slate-400">
                                                    {group.subtitle}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                                        <span>{isCollapsed ? '点击展开情节' : '收起本章'}</span>
                                        {isCollapsed ? (
                                            <ChevronRight className="h-4 w-4" />
                                        ) : (
                                            <ChevronDown className="h-4 w-4" />
                                        )}
                                    </div>
                                </div>

                                {/* 章节内情节横向流转卡片带 (展开时渲染) */}
                                {!isCollapsed && (
                                    <div className="p-4">
                                        <div className="flex items-stretch gap-3 overflow-x-auto pb-3 pt-1 overscroll-contain">
                                            {group.nodes.map((node, nodeIdx) => {
                                                const theme = getThreadTheme(node.thread);
                                                const isSelected = selectedId === node.id;
                                                const isTracingActive = tracingNodeId === node.id;

                                                // 因果追踪状态判定
                                                let traceStatus: 'none' | 'active' | 'cause' | 'effect' | 'dimmed' = 'none';
                                                if (traceResult) {
                                                    if (traceResult.activeNodeId === node.id) {
                                                        traceStatus = 'active';
                                                    } else if (traceResult.upstreamCauses.has(node.id)) {
                                                        traceStatus = 'cause';
                                                    } else if (traceResult.downstreamEffects.has(node.id)) {
                                                        traceStatus = 'effect';
                                                    } else {
                                                        traceStatus = 'dimmed';
                                                    }
                                                }

                                                return (
                                                    <div
                                                        key={node.id}
                                                        className="flex items-center gap-3 shrink-0"
                                                    >
                                                        {/* 事件卡片主体 */}
                                                        <article
                                                            className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all w-[220px] sm:w-[250px] min-h-[150px] bg-white ${
                                                                traceStatus === 'active'
                                                                    ? 'border-orange-500 ring-2 ring-orange-200 shadow-md bg-orange-50/20'
                                                                    : traceStatus === 'cause'
                                                                    ? 'border-blue-400 ring-2 ring-blue-100 shadow-sm bg-blue-50/20'
                                                                    : traceStatus === 'effect'
                                                                    ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm bg-amber-50/20'
                                                                    : traceStatus === 'dimmed'
                                                                    ? 'opacity-30 border-slate-200'
                                                                    : isSelected
                                                                    ? 'border-orange-400 ring-2 ring-orange-100 shadow-sm'
                                                                    : 'border-slate-200 hover:border-orange-300 hover:shadow-md'
                                                            }`}
                                                        >
                                                            {/* 顶部故事线与时间 */}
                                                            <div>
                                                                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                                                                    {node.thread ? (
                                                                        <span
                                                                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${theme.bg} ${theme.text} border ${theme.border}`}
                                                                        >
                                                                            <span
                                                                                className="h-1.5 w-1.5 rounded-full"
                                                                                style={{background: theme.dot}}
                                                                            />
                                                                            <span>{node.thread}</span>
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-300">情节节点</span>
                                                                    )}

                                                                    <span className="truncate max-w-[100px] text-slate-400">
                                                                        {node.timeLabel || '时间未明确'}
                                                                    </span>
                                                                </div>

                                                                {/* 标题 */}
                                                                <h4 className="font-bold text-xs sm:text-sm text-slate-800 line-clamp-2 leading-5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => onSelect(node.id)}
                                                                        className="text-left hover:text-orange-600 transition-colors focus-visible:outline-none"
                                                                    >
                                                                        {node.name}
                                                                    </button>
                                                                </h4>

                                                                {/* 描述摘要 */}
                                                                {node.facts[0]?.description && (
                                                                    <p
                                                                        className={`mt-1.5 text-[11px] leading-relaxed text-slate-500 ${
                                                                            denseMode ? 'line-clamp-1' : 'line-clamp-3'
                                                                        }`}
                                                                    >
                                                                        {node.facts[0].description}
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* 卡片底栏操作与因果追踪 */}
                                                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                                                {/* 因果追踪按钮 */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (tracingNodeId === node.id) {
                                                                            setTracingNodeId(null);
                                                                        } else {
                                                                            setTracingNodeId(node.id);
                                                                        }
                                                                    }}
                                                                    className={`inline-flex items-center gap-1 font-medium transition-colors ${
                                                                        isTracingActive
                                                                            ? 'text-orange-600 underline'
                                                                            : 'text-slate-400 hover:text-orange-600'
                                                                    }`}
                                                                >
                                                                    <Zap className="h-3 w-3" />
                                                                    <span>{isTracingActive ? '退出追踪' : '追踪因果'}</span>
                                                                </button>

                                                                {/* 查看详情抽屉 */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onSelect(node.id)}
                                                                    className="text-slate-400 hover:text-slate-600"
                                                                >
                                                                    详情 &gt;
                                                                </button>
                                                            </div>
                                                        </article>

                                                        {/* 章内连线箭头指示 */}
                                                        {nodeIdx < group.nodes.length - 1 && (
                                                            <div className="text-slate-300 flex items-center shrink-0">
                                                                <ArrowRight className="h-4 w-4" />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* 跨章节线索流动指示 */}
                                        {nextGroup && (
                                            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                                                <span>本章已呈现 {group.nodes.length} 个情节节点</span>
                                                <button
                                                    type="button"
                                                    onClick={() => scrollToChapter(nextGroup.id)}
                                                    className="inline-flex items-center gap-1 font-medium text-orange-600 hover:text-orange-700 transition-colors"
                                                >
                                                    <span>线索顺延进入 {nextGroup.title}</span>
                                                    <ArrowRight className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                {/* 悬浮返回顶部按钮 */}
                {canScrollUp && (
                    <button
                        type="button"
                        onClick={scrollToTop}
                        aria-label="返回顶部"
                        title="返回顶部"
                        className="absolute bottom-6 right-6 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-600 shadow-md backdrop-blur-sm transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
                    >
                        <ArrowUp className="h-4 w-4" />
                    </button>
                )}
            </div>
        </section>
    );
}
