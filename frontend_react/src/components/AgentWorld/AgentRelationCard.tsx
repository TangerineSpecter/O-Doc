import {useEffect, useRef, useState} from 'react';
import {useAgentRelation} from '../../hooks/useAgentRelation';
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
import {chooseRelationTooltipPosition, relationTooltipScene} from '../../utils/relationTooltipLayout';
import './AgentRelationTooltip.css';

echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

const TIER_COLOR: Record<string, string> = {
    中性: '#94a3b8',
    友好: '#fb923c',
    不合: '#60a5fa',
    反感: '#6366f1',
    敌对: '#be123c',
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

const nodeName = (node: AgentRelationNode) => node.departed ? `${node.name}（已离开）`
    : node.kind === 'user' ? `${node.name}（用户）` : node.name;

const firstGlyph = (value: string) => Array.from(value.trim())[0] || '人';

const isImageAvatar = (avatar?: string) => Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));

const nodeSymbol = (node: AgentRelationNode) => {
    const glyph = !isImageAvatar(node.avatar) && node.avatar?.trim() ? firstGlyph(node.avatar) : firstGlyph(node.name);
    const fill = node.status === 'running' ? '#3b82f6' : '#fb923c';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="31" fill="${fill}"/><text x="32" y="41" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#ffffff">${escapeXml(glyph)}</text></svg>`;
    return `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export default function AgentRelationCard({
    graph: currentGraph,
    loading: currentLoading,
    error: currentError,
    selectedEdge: currentSelectedEdge,
    onSelectEdge,
    onSelectAgent,
    onClose,
}: AgentRelationCardProps) {
    const chartRef = useRef<HTMLDivElement>(null);
    const [showDeparted, setShowDeparted] = useState(false);
    const history = useAgentRelation(showDeparted, true);
    const graph = showDeparted ? history.graph : currentGraph;
    const loading = showDeparted ? history.loading : currentLoading;
    const error = showDeparted ? history.error : currentError;
    const selectedEdge = graph?.edges.some(edge => edge.sourceId === currentSelectedEdge?.sourceId
        && edge.targetId === currentSelectedEdge?.targetId) ? currentSelectedEdge : null;

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
                className: 'relation-tooltip-container',
                transitionDuration: 0.12,
                extraCssText: 'border-radius:12px;box-shadow:0 8px 28px rgba(15,23,42,0.12);max-width:calc(100% - 12px);',
                position: (point, _params, element, rect, size) => {
                    const hovered = rect || {x: point[0], y: point[1], width: 1, height: 1};
                    const scene = relationTooltipScene(chart.getZr().storage.getDisplayList(), hovered);
                    const container = element instanceof HTMLElement ? element : null;
                    container?.classList.remove('is-compact');
                    const measure = (): [number, number] => container
                        ? [container.offsetWidth, container.offsetHeight]
                        : size.contentSize;
                    let layout = chooseRelationTooltipPosition(hovered, measure(), size.viewSize, scene);
                    if (layout.overlap && container) {
                        container.classList.add('is-compact');
                        layout = chooseRelationTooltipPosition(hovered, measure(), size.viewSize, scene);
                    }
                    return layout.position;
                },
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
                lineStyle: {curveness: 0.15, width: 1.4, opacity: 0.58},
                edgeLabel: {
                    show: true,
                    position: 'middle',
                    color: '#64748b',
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: '#ffffff',
                    padding: [3, 7],
                    borderRadius: 10,
                },
                emphasis: {
                    focus: 'adjacency',
                    scale: false,
                    itemStyle: {opacity: 1},
                    label: {color: '#0f172a', opacity: 1, fontWeight: 'bold'},
                    lineStyle: {opacity: 1, width: 1.8},
                    edgeLabel: {color: '#334155', opacity: 1},
                },
                blur: {
                    itemStyle: {opacity: 0.12},
                    label: {opacity: 0.16},
                    lineStyle: {opacity: 0.08},
                    edgeLabel: {opacity: 0.12},
                },
                data: graph.nodes.map(node => ({
                    id: node.id,
                    name: nodeName(node),
                    value: node.creativity,
                    symbol: nodeSymbol(node),
                    symbolSize: 54 + Math.round(node.creativity / 8),
                    itemStyle: {opacity: node.departed ? 0.45 : 1},
                    emphasis: {label: {fontWeight: 'bold' as const}},
                })),
                links: graph.edges.map(edge => ({
                    source: edge.sourceId,
                    target: edge.targetId,
                    label: {formatter: edge.tier},
                    lineStyle: {color: TIER_COLOR[edge.band || edge.tier] || '#94a3b8'},
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
                name: nodeName(node),
                value: node.creativity,
                symbol: symbols[index] || nodeSymbol(node),
                symbolSize: 54 + Math.round(node.creativity / 8),
                    itemStyle: {opacity: node.departed ? 0.45 : 1},
                emphasis: {label: {fontWeight: 'bold' as const}},
            }))}]});
        });
        chart.on('click', params => {
            if (params.dataType === 'node') {
                const node = params.data as {id?: string};
                const resident = graph.nodes.find(item => item.id === node.id);
                if (resident && resident.kind !== 'user' && !resident.departed) onSelectAgent(resident.id);
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
        <WorldDialog size="wide" title="关系图谱" description="点击当前居民查看动态，点击连线查看双方好感；已离开居民仅展示历史关系。" onClose={onClose}>
            <label className="mb-4 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={showDeparted} className="h-4 w-4 accent-orange-500"
                    onChange={event => {setShowDeparted(event.target.checked); onSelectEdge(null);}}/>
                显示已离开居民
            </label>
            {loading ? <p className="py-16 text-center text-xs text-slate-400">正在整理最近的互动...</p> : null}
            {error ? <p className="py-12 text-center text-xs text-red-600">{error}</p> : null}
            {!loading && !error && graph && !graph.nodes.length ? (
                <p className="py-16 text-center text-xs text-slate-400">还没有居民。</p>
            ) : null}
            {!loading && !error && graph?.nodes.length ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-4 text-slate-500">
                            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5"/><b className="text-slate-800">{graph.nodes.filter(node => node.kind !== 'user' && !node.departed).length}</b> 位当前居民
                                {showDeparted ? <span> · {graph.nodes.filter(node => node.departed).length} 位已离开</span> : null}</span>
                            <span className="flex items-center gap-1.5"><Network className="h-3.5 w-3.5"/><b className="text-slate-800">{graph.edges.length}</b> 条关系</span>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">长期关系 · 情绪会缓解</span>
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
                    {[['source', selectedEdge.sourceName, selectedEdge.targetName, selectedEdge.sourceRelation], ['target', selectedEdge.targetName, selectedEdge.sourceName, selectedEdge.targetRelation]].map(([direction, name, target, feeling]) => {
                        const value = feeling as AgentRelationEdge['sourceRelation'];
                        if (!value) return null;
                        return <div key={String(direction)} className="mb-2"><strong>{String(name)}</strong> → {String(target)}：好感 {value.affinity}/100 · {value.familiarityLabel} {value.familiarity}/100 · {value.emotion.kind}
                            <p className="mt-1 text-[11px] text-slate-500">{value.reason}</p></div>;
                    })}
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-orange-700">{selectedEdge.tier}{selectedEdge.oneWay ? ' · Agent单方面感受' : ''}</span>
                </div>
            ) : null}
        </WorldDialog>
    );
}
