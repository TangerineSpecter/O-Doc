import {useEffect, useRef} from 'react';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {EChartsOption} from 'echarts';
import type {AgentRelationEdge, AgentRelationGraph, AgentRelationNode} from '../../types/api/setting';
import WorldDialog from './WorldDialog';
import {Network, Users} from 'lucide-react';
import {circularRelationAvatar} from '../../utils/relationAvatar';
import {escapeRelationText as escapeXml, relationNodeTooltip} from '../../utils/relationTooltip';
import './AgentRelationTooltip.css';

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

const nodeSymbol = (node: AgentRelationNode) => {
    const glyph = !isImageAvatar(node.avatar) && node.avatar?.trim() ? firstGlyph(node.avatar) : firstGlyph(node.name);
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
        if (!chartRef.current || loading || error || !graph?.nodes.length) return undefined;
        const chart = echarts.init(chartRef.current);
        const option: EChartsOption = {
            tooltip: {
                trigger: 'item',
                renderMode: 'html',
                confine: true,
                backgroundColor: '#ffffff',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                padding: 10,
                extraCssText: 'border-radius:12px;box-shadow:0 8px 28px rgba(15,23,42,0.12);max-width:calc(100% - 12px);',
                formatter: (params) => {
                    const item = params as {dataType?: string; data?: {id?: string}};
                    if (item.dataType !== 'node') return '';
                    const node = graph.nodes.find(node => node.id === item.data?.id);
                    return node ? relationNodeTooltip(node) : '';
                },
            },
            series: [{
                type: 'graph',
                layout: 'force',
                roam: true,
                draggable: true,
                force: {repulsion: 420, edgeLength: 160, gravity: 0.08},
                label: {show: true, position: 'bottom', fontSize: 12, color: '#334155', formatter: '{b}'},
                lineStyle: {curveness: 0.15, width: 3, opacity: 0.65},
                data: graph.nodes.map(node => ({
                    id: node.id,
                    name: node.name,
                    value: node.creativity,
                    symbol: nodeSymbol(node),
                    symbolSize: 54 + Math.round(node.creativity / 8),
                    emphasis: {label: {fontWeight: 'bold' as const}},
                })),
                links: graph.edges.map(edge => ({
                    source: edge.sourceId,
                    target: edge.targetId,
                    lineStyle: {color: TIER_COLOR[edge.tier] || '#94a3b8'},
                })),
            }],
        };
        chart.setOption(option);
        let disposed = false;
        // Keep nodes visible while images load; failed images retain the circular name avatar.
        void Promise.all(graph.nodes.map(node => isImageAvatar(node.avatar) ? circularRelationAvatar(node.avatar) : Promise.resolve(null))).then(symbols => {
            if (disposed) return;
            chart.setOption({series: [{data: graph.nodes.map((node, index) => ({
                id: node.id,
                name: node.name,
                value: node.creativity,
                symbol: symbols[index] || nodeSymbol(node),
                symbolSize: 54 + Math.round(node.creativity / 8),
                emphasis: {label: {fontWeight: 'bold' as const}},
            }))}]});
        });
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
        const observer = new ResizeObserver(onResize);
        observer.observe(chartRef.current);
        window.addEventListener('resize', onResize);
        return () => {
            disposed = true;
            window.removeEventListener('resize', onResize);
            observer.disconnect();
            chart.dispose();
        };
    }, [graph, loading, error, onSelectAgent, onSelectEdge]);

    return (
        <WorldDialog size="wide" title="关系图谱" description="点击节点查看居民动态，点击连线查看双方好感。" onClose={onClose}>
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在整理最近的互动...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && graph && !graph.nodes.length ? (
                <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p>
            ) : null}
            {!loading && !error && graph?.nodes.length ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-4 text-slate-500">
                            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5"/><b className="text-slate-800">{graph.nodes.length}</b> 位居民</span>
                            <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5"/><b className="text-slate-800">{graph.edges.length}</b> 条关系</span>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">最近 30 天</span>
                    </div>
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60">
                        <div ref={chartRef} className="h-[min(60vh,620px)] min-h-64 w-full"/>
                        <div className="flex flex-wrap justify-center gap-4 border-t border-slate-100 bg-white px-3 py-3">
                            {Object.entries(TIER_COLOR).map(([tier, color]) => <span key={tier} className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className="h-1.5 w-4 rounded-full" style={{backgroundColor: color}}/>{tier}</span>)}
                        </div>
                    </div>
                    <p className="text-center text-[11px] text-slate-500">{graph.edges.length ? '点击头像查看动态 · 点击连线查看双方好感 · 可拖动和缩放' : '暂无互动连线 · 点击节点查看动态 · 可拖动和缩放'}</p>
                </div>
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
