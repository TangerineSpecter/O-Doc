import {useEffect, useRef} from 'react';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {EChartsOption} from 'echarts';
import type {AgentRelationEdge, AgentRelationGraph, AgentRelationNode} from '../../types/api/setting';
import WorldDialog from './WorldDialog';

echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

const TIER_COLOR: Record<string, string> = {
    初识: '#94a3b8',
    熟悉: '#fb923c',
    朋友: '#f97316',
    知己: '#c2410c',
};

interface AgentRelationCardProps {
    graph: AgentRelationGraph | null;
    loading: boolean;
    error: string;
    selectedEdge: AgentRelationEdge | null;
    onSelectEdge: (edge: AgentRelationEdge | null) => void;
    onSelectAgent: (agentId: string) => void;
    onClose: () => void;
}

const firstGlyph = (value: string) => Array.from(value.trim())[0] || '人';

const isImageAvatar = (avatar?: string) => Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));

const escapeXml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const nodeSymbol = (node: AgentRelationNode) => {
    if (isImageAvatar(node.avatar)) {
        return `image://${node.avatar}`;
    }
    const glyph = node.avatar?.trim() ? firstGlyph(node.avatar) : firstGlyph(node.name);
    const fill = node.status === 'running' ? '#3b82f6' : '#fb923c';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="31" fill="${fill}"/><text x="32" y="41" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#ffffff">${escapeXml(glyph)}</text></svg>`;
    return `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default function AgentRelationCard({
    graph,
    loading,
    error,
    selectedEdge,
    onSelectEdge,
    onSelectAgent,
    onClose,
}: AgentRelationCardProps) {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current || !graph?.nodes.length) return undefined;
        const chart = echarts.init(chartRef.current);
        const option: EChartsOption = {
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const item = params as {dataType?: string; data?: {name?: string; value?: number}};
                    if (item.dataType !== 'node') return '';
                    return `${escapeXml(item.data?.name || '')} · 创作力 ${item.data?.value ?? 0}`;
                },
            },
            series: [{
                type: 'graph',
                layout: 'force',
                roam: true,
                draggable: true,
                force: {repulsion: 220, edgeLength: 110},
                label: {show: true, position: 'bottom', fontSize: 11, color: '#334155', formatter: '{b}'},
                lineStyle: {curveness: 0.15, width: 2},
                data: graph.nodes.map(node => ({
                    id: node.id,
                    name: node.name,
                    value: node.creativity,
                    symbol: nodeSymbol(node),
                    symbolSize: 42 + Math.round(node.creativity / 8),
                })),
                links: graph.edges.map(edge => ({
                    source: edge.sourceId,
                    target: edge.targetId,
                    lineStyle: {color: TIER_COLOR[edge.tier] || '#94a3b8'},
                })),
            }],
        };
        chart.setOption(option);
        chart.on('click', params => {
            if (params.dataType === 'node') {
                const node = params.data as {id?: string};
                if (node.id) onSelectAgent(node.id);
                return;
            }
            if (params.dataType === 'edge') {
                const link = params.data as {source?: string; target?: string};
                const edge = graph.edges.find(item => item.sourceId === link.source && item.targetId === link.target);
                onSelectEdge(edge || null);
            }
        });
        const onResize = () => chart.resize();
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            chart.dispose();
        };
    }, [graph, onSelectAgent, onSelectEdge]);

    return (
        <WorldDialog title="关系图谱" description="点圆点筛选该居民的动态，点连线查看双方好感。" onClose={onClose}>
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在整理最近的互动...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && graph && !graph.nodes.length ? (
                <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p>
            ) : null}
            {!loading && !error && graph?.nodes.length ? <div ref={chartRef} className="h-[58vh] min-h-72 w-full"/> : null}
            {!loading && !error && graph?.nodes.length && !graph.edges.length ? (
                <p className="text-center text-xs text-slate-400">还没有互动，彼此仍是陌生。</p>
            ) : null}
            {selectedEdge ? (
                <div className="mt-3 rounded-xl bg-orange-50/80 px-3 py-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{selectedEdge.sourceName}</span>
                    {` → ${selectedEdge.targetName} ${selectedEdge.sourceScore}`}
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="font-semibold text-slate-800">{selectedEdge.targetName}</span>
                    {` → ${selectedEdge.sourceName} ${selectedEdge.targetScore}`}
                    <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-orange-700">{selectedEdge.tier}</span>
                </div>
            ) : null}
        </WorldDialog>
    );
}
