import React, {useEffect, useRef} from 'react';
import ReactMarkdown from 'react-markdown';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {LegendComponent, TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {EChartsOption} from 'echarts';
import {Edit3, Hash, Info, Network, PanelRightOpen, RefreshCw, X} from 'lucide-react';
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

    useEffect(() => {
        if (!graphRef.current || !graphData) return;

        const chart = graphChartRef.current || echarts.init(graphRef.current);
        graphChartRef.current = chart;
        let graphLabelsVisible = true;

        const getNormalLinkStyle = (link: any) => (
            link.relation === '相似'
                ? {color: '#f97316', opacity: 0.18, width: 0.7 + Math.min(0.9, (link.similarity || 0.72) - 0.6)}
                : {color: '#a78bfa', opacity: 0.16, width: 0.8}
        );
        const getActiveLinkStyle = (link: any) => (
            link.relation === '相似'
                ? {color: '#f97316', opacity: 0.56, width: 2}
                : {color: '#a78bfa', opacity: 0.42, width: 1.4}
        );
        const buildGraphLinks = (activeNodeId?: string) => (
            graphData.links.map(link => {
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
                            opacity: 0.56,
                            width: 2,
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
                    links: buildGraphLinks(),
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
                series: [{links: buildGraphLinks(params.data.id)}],
            });
        };
        const handleMouseOut = (params: any) => {
            if (params.dataType !== 'node') return;
            chart.setOption({
                series: [{links: buildGraphLinks()}],
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
        window.setTimeout(() => graphChartRef.current?.resize(), 180);
    }, [graphDetailCollapsed]);

    useEffect(() => {
        return () => {
            graphChartRef.current?.dispose();
            graphChartRef.current = null;
        };
    }, []);

    const renderNodeAttributes = (node: MemoGraphNode, relatedCount: number) => {
        const memo = node.memo;
        const author = memo ? getMemoAuthorMeta(memo) : null;
        const attributes = memo ? [
            {label: '节点类型', value: '闪念'},
            {label: '节点 ID', value: node.id},
            {label: '字数', value: `${memo.content.length}`},
            {label: '标签', value: memo.tag || '未归类'},
            {label: '置顶', value: memo.isPinned ? '是' : '否'},
            {label: '来源', value: author?.isAgent ? 'Agent' : '用户'},
            {label: '创建者', value: author?.name || '未知账号'},
            {label: '关联数', value: `${relatedCount}`},
            {label: '创建时间', value: formatDate(memo.createdAt)},
            {label: '更新时间', value: formatDate(memo.updatedAt)},
        ] : [
            {label: '节点类型', value: '标签'},
            {label: '节点 ID', value: node.id},
            {label: '标签路径', value: node.name},
            {label: '闪念数量', value: `${node.value}`},
            {label: '关联数', value: `${relatedCount}`},
        ];

        return (
            <div className="mt-5">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                    <Info className="h-3.5 w-3.5"/>
                    属性
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {attributes.map(item => (
                        <div key={item.label} className="grid grid-cols-[72px_minmax(0,1fr)] border-b border-slate-100 text-xs last:border-b-0">
                            <div className="bg-slate-50 px-3 py-2 font-medium text-slate-500">{item.label}</div>
                            <div className="min-w-0 break-words px-3 py-2 text-slate-700">{item.value}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const stats = graphData?.stats;
    const relatedLinks = selectedGraphNode && graphData
        ? graphData.links.filter(link => link.source === selectedGraphNode.id || link.target === selectedGraphNode.id)
        : [];
    const isDetailCollapsed = graphDetailCollapsed || !selectedGraphNode;

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Network className="h-4 w-4 text-orange-600"/>
                        知识图谱
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                        用标签和 embedding 相似度把相关闪念连起来。
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {stats && (
                        <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-100">
                            <span>{stats.memoCount} 条闪念</span>
                            <span className="h-1 w-1 rounded-full bg-slate-300"/>
                            <span>{stats.semanticLinkCount} 条相似关系</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={graphLoading || vectorSyncing}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${graphLoading ? 'animate-spin' : ''}`}/>
                        刷新
                    </button>
                    <button
                        type="button"
                        onClick={onSyncHistory}
                        disabled={graphLoading || vectorSyncing}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-orange-500 px-3 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${vectorSyncing ? 'animate-spin' : ''}`}/>
                        {vectorSyncing ? '同步中' : '同步历史'}
                    </button>
                </div>
            </div>

            <div className={`grid min-h-[620px] transition-[grid-template-columns] duration-200 ${
                isDetailCollapsed
                    ? 'lg:grid-cols-[minmax(0,1fr)_48px]'
                    : 'lg:grid-cols-[minmax(0,1fr)_300px]'
            }`}>
                <div className="relative min-h-[520px] bg-[radial-gradient(circle_at_20%_20%,rgba(249,115,22,0.08),transparent_32%),linear-gradient(180deg,#fff,#f8fafc)]">
                    {graphLoading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm text-slate-500 backdrop-blur-sm">
                            正在梳理关系...
                        </div>
                    )}
                    {graphData && graphData.nodes.length > 0 ? (
                        <div ref={graphRef} className="h-[620px] w-full cursor-grab touch-none active:cursor-grabbing"/>
                    ) : (
                        <div className="flex h-[520px] flex-col items-center justify-center text-center">
                            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                                <Network className="h-7 w-7"/>
                            </div>
                            <p className="font-semibold text-slate-800">还没有可展示的图谱</p>
                            <p className="mt-1 text-sm text-slate-400">先记录几条闪念，或者换个筛选条件。</p>
                        </div>
                    )}
                </div>

                <aside className={`border-t border-slate-100 bg-slate-50/70 transition-all duration-200 lg:border-l lg:border-t-0 ${
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
                    ) : selectedGraphNode ? (
                        <div>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                                    selectedGraphNode.category === 'memo'
                                        ? 'bg-orange-50 text-orange-700 ring-orange-100'
                                        : 'bg-violet-50 text-violet-700 ring-violet-100'
                                }`}>
                                    {selectedGraphNode.category === 'memo' ? '闪念' : '标签'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onDetailCollapsedChange(true)}
                                    className="rounded-md p-1 text-slate-400 transition hover:bg-white hover:text-slate-700"
                                    title="收起详情"
                                >
                                    <X className="h-4 w-4"/>
                                </button>
                            </div>

                            {selectedGraphNode.memo ? (
                                <div>
                                    <p className="text-xs text-slate-400">{formatDate(selectedGraphNode.memo.createdAt)}</p>
                                    <div className="memo-markdown mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800">
                                        <ReactMarkdown
                                            remarkPlugins={remarkPlugins}
                                            components={markdownComponents as any}
                                        >
                                            {selectedGraphNode.memo.content}
                                        </ReactMarkdown>
                                    </div>
                                    {selectedGraphNode.memo.tag && (
                                        <div className="mt-3 inline-flex max-w-full items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-600 ring-1 ring-violet-100">
                                            <Hash className="h-3 w-3 shrink-0"/>
                                            <span className="truncate">{renderTagLabel(selectedGraphNode.memo.tag)}</span>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => selectedGraphNode.memo && onEditMemo(selectedGraphNode.memo)}
                                        className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600"
                                    >
                                        <Edit3 className="h-4 w-4"/>
                                        编辑这条闪念
                                    </button>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="break-words text-base font-bold text-slate-900">{selectedGraphNode.name}</h3>
                                    <p className="mt-2 text-sm text-slate-500">{selectedGraphNode.value} 条闪念使用这个标签。</p>
                                </div>
                            )}

                            {renderNodeAttributes(selectedGraphNode, relatedLinks.length)}

                            <div className="mt-5">
                                <h3 className="mb-2 text-xs font-bold text-slate-500">关联</h3>
                                {relatedLinks.length === 0 ? (
                                    <p className="text-xs text-slate-400">暂无关联边。</p>
                                ) : (
                                    <div className="space-y-2">
                                        {relatedLinks.slice(0, 8).map((link, index) => {
                                            const otherId = link.source === selectedGraphNode.id ? link.target : link.source;
                                            const otherNode = graphData?.nodes.find(node => node.id === otherId);
                                            return (
                                                <button
                                                    key={`${link.source}-${link.target}-${index}`}
                                                    type="button"
                                                    onClick={() => otherNode && onSelectNode(otherNode)}
                                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs transition hover:border-orange-200 hover:bg-orange-50"
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="min-w-0 truncate font-medium text-slate-700">{otherNode?.name || otherId}</span>
                                                        <span className="shrink-0 text-slate-400">{link.relation}</span>
                                                    </div>
                                                    {link.similarity && (
                                                        <p className="mt-1 text-slate-400">相似度 {Math.round(link.similarity * 100)}%</p>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-slate-200 bg-white/70 p-4 text-sm leading-6 text-slate-500">
                            点击图上的闪念或标签，可以在这里查看内容和关联。
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
