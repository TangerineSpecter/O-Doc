import React, {useEffect, useRef} from 'react';
import ReactMarkdown from 'react-markdown';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {LegendComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {EChartsOption} from 'echarts';
import {ChevronRight, Edit3, Hash, Network, PanelRightOpen, Pin, RefreshCw, StickyNote, X} from 'lucide-react';
import type {MemoGraphNode, MemoKnowledgeGraph, MemoItem} from '../../types/api/memo';

echarts.use([GraphChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const GRAPH_LABEL_VISIBLE_MIN_ZOOM = 0.62;
const GRAPH_LABEL_MAX_LENGTH = 10;
const GRAPH_TOOLTIP_MAX_LENGTH = 50;

const formatGraphLabel = (value?: string) => {
    const firstLine = (value || '').split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
    return firstLine.length > GRAPH_LABEL_MAX_LENGTH
        ? `${firstLine.slice(0, GRAPH_LABEL_MAX_LENGTH)}...`
        : firstLine;
};

const escapeHtml = (value: string) => (
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
);

const formatGraphTooltipText = (value?: string) => {
    const normalized = (value || '').replace(/\s+/g, ' ').trim();
    const preview = normalized.length > GRAPH_TOOLTIP_MAX_LENGTH
        ? `${normalized.slice(0, GRAPH_TOOLTIP_MAX_LENGTH)}...`
        : normalized;

    return escapeHtml(preview || '暂无内容');
};

interface MemoAuthorMeta {
    name: string;
    isAgent: boolean;
}

interface KnowledgeGraphPanelProps {
    graphData: MemoKnowledgeGraph | null;
    graphLoading: boolean;
    vectorSyncing: boolean;
    selectedGraphNode: MemoGraphNode | null;
    graphDetailCollapsed: boolean;
    markdownComponents: Record<string, any>;
    remarkPlugins: any[];
    onRefresh: () => void;
    onSyncHistory: () => void;
    onSelectNode: (node: MemoGraphNode | null) => void;
    onDetailCollapsedChange: (collapsed: boolean) => void;
    onEditMemo: (memo: MemoItem) => void;
    formatDate: (date: string) => string;
    renderTagLabel: (tagPath: string) => React.ReactNode;
    getMemoAuthorMeta: (memo: MemoItem) => MemoAuthorMeta;
}

export default function KnowledgeGraphPanel({
    graphData,
    graphLoading,
    vectorSyncing,
    selectedGraphNode,
    graphDetailCollapsed,
    markdownComponents,
    remarkPlugins,
    onRefresh,
    onSyncHistory,
    onSelectNode,
    onDetailCollapsedChange,
    onEditMemo,
    formatDate,
    renderTagLabel,
    getMemoAuthorMeta,
}: KnowledgeGraphPanelProps) {
    const graphRef = useRef<HTMLDivElement | null>(null);
    const graphChartRef = useRef<echarts.ECharts | null>(null);

    const getNormalLinkStyle = (link: any) => (
        link.relation === '相似'
            ? {color: '#f97316', opacity: 0.2, width: 0.8}
            : {color: '#a78bfa', opacity: 0.18, width: 0.8}
    );
    const getActiveLinkStyle = (link: any) => (
        link.relation === '相似'
            ? {color: '#f97316', opacity: 0.52, width: 1.2}
            : {color: '#a78bfa', opacity: 0.46, width: 1.2}
    );
    const buildGraphLinks = (links: any[], activeNodeId?: string) => (
        links.map(link => {
            const isActive = activeNodeId && (link.source === activeNodeId || link.target === activeNodeId);
            return {
                ...link,
                lineStyle: isActive ? getActiveLinkStyle(link) : getNormalLinkStyle(link),
                emphasis: {
                    lineStyle: getActiveLinkStyle(link),
                },
            };
        })
    );

    useEffect(() => {
        if (!graphRef.current || !graphData) return;

        const chart = graphChartRef.current || echarts.init(graphRef.current);
        graphChartRef.current = chart;
        let graphLabelsVisible = true;

        const option: EChartsOption = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                confine: true,
                extraCssText: 'max-width: 360px; white-space: normal; word-break: break-word; line-height: 1.6;',
                formatter: (params: any) => {
                    const data = params.data || {};
                    if (params.dataType === 'edge') {
                        return data.relation === '相似'
                            ? `相似度 ${Math.round((data.similarity || 0) * 100)}%`
                            : data.relation || '关联';
                    }
                    if (data.category === 'tag') {
                        return `标签: ${formatGraphTooltipText(data.name)}<br/>${data.value || 0} 条闪念`;
                    }
                    return formatGraphTooltipText(data.memo?.content || data.name);
                },
            },
            legend: {
                bottom: 10,
                itemWidth: 10,
                itemHeight: 10,
                textStyle: {color: '#64748b', fontSize: 12},
            },
            series: [
                {
                    type: 'graph',
                    layout: 'force',
                    roam: true,
                    draggable: false,
                    focusNodeAdjacency: true,
                    categories: [
                        {name: 'memo', itemStyle: {color: '#f97316'}},
                        {name: 'tag', itemStyle: {color: '#8b5cf6'}},
                    ],
                    label: {
                        show: true,
                        position: 'bottom',
                        distance: 8,
                        color: '#334155',
                        align: 'center',
                        fontSize: 11,
                        formatter: (params: any) => formatGraphLabel(params.data?.name),
                    },
                    lineStyle: {
                        color: 'source',
                        opacity: 0.16,
                        width: 0.8,
                        curveness: 0.16,
                    },
                    emphasis: {
                        focus: 'adjacency',
                        label: {
                            show: true,
                        },
                        lineStyle: {
                            opacity: 0.52,
                            width: 1.2,
                        },
                    },
                    force: {
                        repulsion: 170,
                        gravity: 0.08,
                        edgeLength: [72, 138],
                        friction: 0.36,
                    },
                    data: graphData.nodes.map(node => ({
                        ...node,
                        category: node.category,
                        symbolSize: node.symbolSize,
                        itemStyle: node.category === 'memo'
                            ? {
                                color: node.memo?.isPinned ? '#f97316' : '#fb923c',
                                borderColor: '#fff7ed',
                                borderWidth: 2,
                            }
                            : {
                                color: '#8b5cf6',
                                borderColor: '#f5f3ff',
                                borderWidth: 2,
                            },
                        label: node.category === 'tag'
                            ? {
                                position: 'bottom',
                                distance: 8,
                                align: 'center',
                                fontSize: 12,
                                fontWeight: 700,
                                formatter: (params: any) => formatGraphLabel(params.data?.name),
                            }
                            : {
                                position: 'bottom',
                                distance: 8,
                                align: 'center',
                                formatter: (params: any) => formatGraphLabel(params.data?.name),
                            },
                    })),
                    links: buildGraphLinks(graphData.links, selectedGraphNode?.id),
                },
            ],
        };

        chart.setOption(option, true);

        const getCurrentGraphZoom = () => {
            const currentOption = chart.getOption() as any;
            const series = Array.isArray(currentOption.series) ? currentOption.series[0] : undefined;
            const zoom = Number(series?.zoom);
            return Number.isFinite(zoom) ? zoom : 1;
        };

        const updateGraphLabelVisibility = () => {
            const shouldShowLabels = getCurrentGraphZoom() >= GRAPH_LABEL_VISIBLE_MIN_ZOOM;
            if (shouldShowLabels === graphLabelsVisible) return;

            graphLabelsVisible = shouldShowLabels;
            chart.setOption({
                series: [
                    {
                        label: {
                            show: shouldShowLabels,
                        },
                        emphasis: {
                            label: {
                                show: true,
                            },
                        },
                    },
                ],
            });
        };

        const handleClick = (params: any) => {
            if (params.dataType !== 'node') return;
            onSelectNode(params.data as MemoGraphNode);
            onDetailCollapsedChange(false);
        };
        const handleMouseOver = (params: any) => {
            if (params.dataType !== 'node') return;
            chart.setOption({
                series: [{links: buildGraphLinks(graphData.links, params.data.id)}],
            });
        };
        const handleMouseOut = (params: any) => {
            if (params.dataType !== 'node') return;
            chart.setOption({
                series: [{links: buildGraphLinks(graphData.links, selectedGraphNode?.id)}],
            });
        };

        chart.off('click');
        chart.off('mouseover');
        chart.off('mouseout');
        chart.off('graphRoam' as any);
        chart.off('graphroam' as any);
        chart.on('click', handleClick);
        chart.on('mouseover', handleMouseOver);
        chart.on('mouseout', handleMouseOut);
        chart.on('graphRoam' as any, updateGraphLabelVisibility);
        chart.on('graphroam' as any, updateGraphLabelVisibility);

        const resizeObserver = new ResizeObserver(() => chart.resize());
        resizeObserver.observe(graphRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.off('click', handleClick);
            chart.off('mouseover', handleMouseOver);
            chart.off('mouseout', handleMouseOut);
            chart.off('graphRoam' as any, updateGraphLabelVisibility);
            chart.off('graphroam' as any, updateGraphLabelVisibility);
        };
    }, [graphData, onDetailCollapsedChange, onSelectNode]);

    useEffect(() => {
        if (!graphChartRef.current || !graphData) return;
        graphChartRef.current.setOption({
            series: [{
                links: buildGraphLinks(graphData.links, selectedGraphNode?.id),
            }],
        });
    }, [selectedGraphNode, graphData]);

    useEffect(() => {
        window.setTimeout(() => graphChartRef.current?.resize(), 180);
    }, [graphDetailCollapsed]);

    useEffect(() => {
        return () => {
            graphChartRef.current?.dispose();
            graphChartRef.current = null;
        };
    }, []);

    const stats = graphData?.stats;
    const relatedLinks = selectedGraphNode && graphData
        ? graphData.links.filter(link => link.source === selectedGraphNode.id || link.target === selectedGraphNode.id)
        : [];
    const isDetailCollapsed = graphDetailCollapsed || !selectedGraphNode;

    const renderDetailBody = (isMobile = false) => {
        if (!selectedGraphNode) {
            return (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center">
                    <Network className="mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-xs font-medium text-slate-600">未选择节点</p>
                    <p className="mt-1 text-[11px] text-slate-400">轻触图谱中的圆点，查看内容与关联网络。</p>
                </div>
            );
        }

        const isMemo = selectedGraphNode.category === 'memo' && selectedGraphNode.memo;
        const memo = selectedGraphNode.memo;
        const author = memo ? getMemoAuthorMeta(memo) : null;

        return (
            <div className="space-y-3.5">
                {/* 桌面端面板顶部操作条（移动端在外层已有标题栏） */}
                {!isMobile && (
                    <div className="flex items-center justify-between gap-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                            isMemo
                                ? 'bg-orange-50 text-orange-700 ring-orange-200/60'
                                : 'bg-violet-50 text-violet-700 ring-violet-200/60'
                        }`}>
                            {isMemo ? (
                                <>
                                    <StickyNote className="h-3 w-3 text-orange-500" />
                                    <span>闪念详情</span>
                                </>
                            ) : (
                                <>
                                    <Hash className="h-3 w-3 text-violet-500" />
                                    <span>标签聚类</span>
                                </>
                            )}
                        </span>
                        <button
                            type="button"
                            onClick={() => onDetailCollapsedChange(true)}
                            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                            title="收起详情"
                        >
                            <X className="h-4 w-4"/>
                        </button>
                    </div>
                )}

                {/* 节点主体内容区 */}
                {isMemo && memo ? (
                    /* 闪念详情卡片 */
                    <div className="rounded-2xl border border-orange-100/80 bg-gradient-to-b from-orange-50/30 via-white to-white p-3.5 shadow-sm">
                        {/* 闪念元信息行 */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-orange-100/60 pb-2.5">
                            <span className="text-[11px] font-medium text-slate-400">
                                {formatDate(memo.createdAt)}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {memo.isPinned && (
                                    <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/60">
                                        <Pin className="h-2.5 w-2.5" />
                                        已置顶
                                    </span>
                                )}
                                {memo.tag && (
                                    <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-violet-200/60">
                                        <Hash className="h-2.5 w-2.5 shrink-0" />
                                        <span className="max-w-[120px] truncate">{renderTagLabel(memo.tag)}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* 便签正文阅读区 */}
                        <div className="memo-markdown mt-3 max-h-56 sm:max-h-64 overflow-y-auto rounded-xl border border-slate-200/70 bg-white p-3 text-xs sm:text-sm leading-6 text-slate-800 shadow-inner">
                            <ReactMarkdown
                                remarkPlugins={remarkPlugins}
                                components={markdownComponents as any}
                            >
                                {memo.content}
                            </ReactMarkdown>
                        </div>

                        {/* 极简核心指标条 */}
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 py-1.5 px-2">
                                <div className="text-[10px] text-slate-400">正文字数</div>
                                <div className="mt-0.5 text-xs font-bold text-slate-700">{memo.content.length} 字</div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 py-1.5 px-2">
                                <div className="text-[10px] text-slate-400">记录人</div>
                                <div className="mt-0.5 truncate text-xs font-bold text-slate-700">
                                    {author?.name || (author?.isAgent ? 'Agent' : '我')}
                                </div>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-slate-50/70 py-1.5 px-2">
                                <div className="text-[10px] text-slate-400">图谱连线</div>
                                <div className="mt-0.5 text-xs font-bold text-orange-600">{relatedLinks.length} 条</div>
                            </div>
                        </div>

                        {/* 操作按钮 */}
                        <button
                            type="button"
                            onClick={() => onEditMemo(memo)}
                            className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-98"
                        >
                            <Edit3 className="h-3.5 w-3.5"/>
                            编辑这条闪念
                        </button>
                    </div>
                ) : (
                    /* 标签聚类主题卡片 */
                    <div className="rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50/70 via-purple-50/30 to-white p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/20">
                                <Hash className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold text-violet-600">标签聚类主题</div>
                                <h3 className="mt-0.5 truncate text-base font-bold text-slate-900" title={selectedGraphNode.name}>
                                    #{selectedGraphNode.name}
                                </h3>
                            </div>
                        </div>

                        {/* 标签指标卡片 */}
                        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                            <div className="rounded-xl border border-violet-100/70 bg-white/90 p-2.5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                <div className="text-[11px] text-slate-400">包含闪念</div>
                                <div className="mt-1 text-base font-bold text-violet-700">
                                    {selectedGraphNode.value} <span className="text-xs font-normal text-slate-400">条</span>
                                </div>
                            </div>
                            <div className="rounded-xl border border-violet-100/70 bg-white/90 p-2.5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                <div className="text-[11px] text-slate-400">关联网络</div>
                                <div className="mt-1 text-base font-bold text-orange-600">
                                    {relatedLinks.length} <span className="text-xs font-normal text-slate-400">条</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 关联网络列表卡片 */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                        <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Network className="h-3.5 w-3.5 text-orange-500" />
                            关联网络 ({relatedLinks.length})
                        </h3>
                        {relatedLinks.length > 0 && (
                            <span className="text-[10px] text-slate-400">轻触探索</span>
                        )}
                    </div>

                    {relatedLinks.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
                            暂无直接关联节点
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {relatedLinks.slice(0, 10).map((link, index) => {
                                const otherId = link.source === selectedGraphNode.id ? link.target : link.source;
                                const otherNode = graphData?.nodes.find(node => node.id === otherId);
                                const isOtherTag = otherNode?.category === 'tag';

                                return (
                                    <button
                                        key={`${link.source}-${link.target}-${index}`}
                                        type="button"
                                        onClick={() => otherNode && onSelectNode(otherNode)}
                                        className="group flex w-full items-center justify-between gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5 text-left transition-all hover:border-orange-200 hover:bg-orange-50/40 hover:shadow-sm active:scale-[0.99]"
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                                isOtherTag
                                                    ? 'bg-violet-50 text-violet-600'
                                                    : 'bg-orange-50 text-orange-600'
                                            }`}>
                                                {isOtherTag ? (
                                                    <Hash className="h-3.5 w-3.5" />
                                                ) : (
                                                    <StickyNote className="h-3.5 w-3.5" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-semibold text-slate-800 transition-colors group-hover:text-orange-600">
                                                    {otherNode?.name || otherId}
                                                </p>
                                                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                                                    <span>{link.relation === '相似' ? '语义相似' : (link.relation || '关联')}</span>
                                                    {link.similarity && (
                                                        <span className="font-semibold text-orange-600">
                                                            {Math.round(link.similarity * 100)}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-orange-500" />
                                    </button>
                                );
                            })}
                            {relatedLinks.length > 10 && (
                                <p className="pt-1 text-center text-[10px] text-slate-400">
                                    仅展示前 10 条关联
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Network className="h-4 w-4 text-orange-600"/>
                        知识图谱
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                        用标签和语义相似度探索闪念之间的网状关联。
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {stats && (
                        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-100">
                            <span>{stats.memoCount} 条闪念</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300"/>
                            <span>{stats.semanticLinkCount} 条关系</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={graphLoading || vectorSyncing}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${graphLoading ? 'animate-spin' : ''}`}/>
                        刷新
                    </button>
                    <button
                        type="button"
                        onClick={onSyncHistory}
                        disabled={graphLoading || vectorSyncing}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-500 px-3 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${vectorSyncing ? 'animate-spin' : ''}`}/>
                        {vectorSyncing ? '同步中' : '同步历史'}
                    </button>
                </div>
            </div>

            <div className={`grid transition-[grid-template-columns] duration-200 ${
                isDetailCollapsed
                    ? 'lg:grid-cols-[minmax(0,1fr)_48px]'
                    : 'lg:grid-cols-[minmax(0,1fr)_300px]'
            }`}>
                <div className="relative h-[calc(100vh-230px)] min-h-[460px] lg:h-[620px] bg-[radial-gradient(circle_at_20%_20%,rgba(249,115,22,0.08),transparent_32%),linear-gradient(180deg,#fff,#f8fafc)]">
                    {graphLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-500 backdrop-blur-sm">
                            正在梳理关系...
                        </div>
                    )}
                    {graphData && graphData.nodes.length > 0 ? (
                        <div ref={graphRef} className="h-full w-full cursor-grab touch-none active:cursor-grabbing"/>
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                                <Network className="h-7 w-7"/>
                            </div>
                            <p className="font-semibold text-slate-800">还没有可展示的图谱</p>
                            <p className="mt-1 text-sm text-slate-400">先记录几条闪念，或者换个筛选条件。</p>
                        </div>
                    )}

                    {/* 移动端轻量悬浮提示：当选中了节点但抽屉收起时，提供一键重新唤起抽屉的胶囊 */}
                    {selectedGraphNode && graphDetailCollapsed && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 lg:hidden">
                            <button
                                type="button"
                                onClick={() => onDetailCollapsedChange(false)}
                                className="flex items-center gap-1.5 rounded-full bg-slate-900/85 px-3.5 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md transition active:scale-95"
                            >
                                <PanelRightOpen className="h-3.5 w-3.5 text-orange-400"/>
                                <span className="max-w-[180px] truncate">查看「{selectedGraphNode.name}」详情</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* 桌面端右侧面板（移动端隐藏） */}
                <aside className={`hidden lg:block border-l border-slate-100 bg-slate-50/70 transition-all duration-200 ${
                    isDetailCollapsed ? 'p-2' : 'p-4'
                }`}>
                    {isDetailCollapsed ? (
                        <button
                            type="button"
                            onClick={() => selectedGraphNode && onDetailCollapsedChange(false)}
                            className="flex h-full min-h-[520px] w-full flex-col items-center justify-start gap-2 rounded-lg border border-dashed border-slate-200 bg-white/80 px-2 py-4 text-slate-400 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600"
                            title={selectedGraphNode ? '展开详情' : '点击节点后查看详情'}
                        >
                            <PanelRightOpen className="h-4 w-4"/>
                            <span className="[writing-mode:vertical-rl] text-xs font-medium tracking-widest">
                                {selectedGraphNode ? '详情' : '点节点'}
                            </span>
                        </button>
                    ) : (
                        renderDetailBody(false)
                    )}
                </aside>
            </div>

            {/* 移动端专属：底部滑出详情抽屉 (Bottom Sheet) */}
            <div className="lg:hidden">
                {selectedGraphNode && !graphDetailCollapsed && (
                    <div className="fixed inset-0 z-50 flex flex-col justify-end">
                        {/* 背景半透明遮罩 */}
                        <div
                            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-200"
                            onClick={() => onDetailCollapsedChange(true)}
                        />
                        {/* 抽屉卡片容器 */}
                        <div className="relative z-10 flex max-h-[82vh] flex-col rounded-t-3xl border-t border-slate-200/80 bg-white shadow-2xl animate-in slide-in-from-bottom duration-300">
                            {/* 顶部中央拖拽手柄条 */}
                            <div
                                className="flex justify-center pt-3 pb-1 cursor-pointer"
                                onClick={() => onDetailCollapsedChange(true)}
                            >
                                <div className="h-1.5 w-10 rounded-full bg-slate-300/80 transition hover:bg-slate-400" />
                            </div>

                            {/* 抽屉标题栏 */}
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                                        selectedGraphNode.category === 'memo'
                                            ? 'bg-orange-50 text-orange-700 ring-orange-200/60'
                                            : 'bg-violet-50 text-violet-700 ring-violet-200/60'
                                    }`}>
                                        {selectedGraphNode.category === 'memo' ? (
                                            <>
                                                <StickyNote className="h-3 w-3 text-orange-500" />
                                                <span>闪念详情</span>
                                            </>
                                        ) : (
                                            <>
                                                <Hash className="h-3 w-3 text-violet-500" />
                                                <span>标签聚类</span>
                                            </>
                                        )}
                                    </span>
                                    {selectedGraphNode.category === 'memo' && selectedGraphNode.memo && (
                                        <span className="text-[11px] text-slate-400">{formatDate(selectedGraphNode.memo.createdAt)}</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onDetailCollapsedChange(true)}
                                    className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                                    title="关闭"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            {/* 抽屉滚动内容 */}
                            <div className="flex-1 overflow-y-auto p-4 pb-8 scrollbar-hide">
                                {renderDetailBody(true)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
