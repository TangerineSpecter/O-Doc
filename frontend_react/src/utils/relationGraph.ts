import type {EChartsOption} from 'echarts';
import type {AgentRelationGraph, AgentRelationNode} from '../types/api/setting';
import {escapeRelationText, relationEdgeTooltip, relationNodeTooltip} from './relationTooltip';

export const RELATION_TIER_COLORS: Record<string, string> = {
    中性: '#94a3b8', 友好: '#fb923c', 不合: '#60a5fa', 反感: '#6366f1',
    敌对: '#be123c', 朋友: '#f97316', 知己: '#c2410c',
};

export const relationNodeName = (node: AgentRelationNode) => node.departed ? `${node.name}（已离开）`
    : node.kind === 'user' ? `${node.name}（用户）` : node.name;

export const isRelationImageAvatar = (avatar?: string) => Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));

export function relationNodeSymbol(node: AgentRelationNode): string {
    const text = !isRelationImageAvatar(node.avatar) && node.avatar?.trim() ? node.avatar : node.name;
    const glyph = Array.from(text.trim())[0] || '人';
    const fill = node.kind === 'user' ? '#f97316' : node.status === 'running' ? '#3b82f6' : '#fb923c';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="31" fill="${fill}"/><text x="32" y="41" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#ffffff">${escapeRelationText(glyph)}</text></svg>`;
    return `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function relationGraphNodes(graph: AgentRelationGraph, compact: boolean, symbols?: (string | null)[], size: [number, number] = [1100, 620]) {
    // Seed physics with separated nodes; the force simulation remains active during dragging.
    return graph.nodes.map((node, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / graph.nodes.length;
        return {
            id: node.id, name: relationNodeName(node), value: node.creativity,
            x: Math.cos(angle) * Math.max(80, size[0] - (compact ? 96 : 152)) / 2,
            y: Math.sin(angle) * Math.max(80, size[1] - 110) / 2,
            symbol: symbols?.[index] || relationNodeSymbol(node),
            symbolSize: compact ? 38 : 44,
            itemStyle: {opacity: node.departed ? 0.45 : 1},
        };
    });
}

export function relationGraphOption(graph: AgentRelationGraph, compact: boolean, size?: [number, number]): EChartsOption {
    const [width, height] = size || [1100, 620];
    const edgeLength = Math.max(compact ? 110 : 240, Math.min(compact ? 160 : 420,
        Math.sqrt(Math.max(10000, (width - 120) * (height - 110)) / Math.max(4, graph.nodes.length)) * 1.8));
    return {
        animation: false,
        tooltip: {
            trigger: 'item', renderMode: 'html', confine: true, enterable: false,
            triggerOn: 'none', hideDelay: 0,
            backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1, padding: 10,
            className: 'relation-tooltip-container', transitionDuration: 0,
            extraCssText: 'border-radius:12px;box-shadow:0 8px 28px rgba(15,23,42,0.12);max-width:calc(100% - 12px);',
            formatter: params => {
                const item = params as {dataType?: string; dataIndex: number; data?: {id?: string}};
                if (item.dataType === 'edge') {
                    const edge = graph.edges[item.dataIndex];
                    return edge ? relationEdgeTooltip(edge) : '';
                }
                const node = graph.nodes.find(node => node.id === item.data?.id);
                return node ? relationNodeTooltip(node) : '';
            },
        },
        series: [{
            type: 'graph', layout: 'force', preserveAspect: true,
            force: {initLayout: 'none', repulsion: compact ? 180 : 1000,
                edgeLength, gravity: 0.08, friction: 0.12, layoutAnimation: true},
            stateAnimation: {duration: 0},
            left: compact ? 48 : 76, right: compact ? 48 : 76, top: 48, bottom: 62,
            roam: true, draggable: true, scaleLimit: {min: 0.25, max: 2.5},
            label: {show: true, position: 'bottom', distance: 7, fontSize: compact ? 11 : 12,
                width: compact ? 52 : 108, overflow: 'truncate', color: '#334155', formatter: '{b}'},
            lineStyle: {curveness: 0.06, width: 1.2, opacity: 0.3},
            edgeLabel: {show: false, silent: true, color: '#334155', opacity: 1, fontSize: compact ? 10 : 11,
                backgroundColor: '#ffffff', padding: [3, 5], borderRadius: 5, lineHeight: 16},
            emphasis: {
                focus: 'adjacency', scale: false, itemStyle: {opacity: 1},
                label: {color: '#0f172a', opacity: 1, fontWeight: 'bold'},
                lineStyle: {opacity: 0.9, width: 2}, edgeLabel: {show: true, opacity: 1, color: '#334155'},
            },
            blur: {itemStyle: {opacity: 0.2}, label: {opacity: 0.3}, lineStyle: {opacity: 0.04}, edgeLabel: {show: false}},
            data: relationGraphNodes(graph, compact, undefined, size),
            links: graph.edges.map(edge => ({
                source: edge.sourceId, target: edge.targetId,
                label: {formatter: edge.tier},
                lineStyle: {color: RELATION_TIER_COLORS[edge.band || edge.tier] || '#94a3b8'},
            })),
        }],
    };
}
