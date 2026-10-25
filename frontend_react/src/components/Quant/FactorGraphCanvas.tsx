import type {QuantGraph, QuantGraphNode} from '../../types/api/quantGraph';

/** A focused, bounded overview; every relationship is also available as text. */
export function FactorGraphCanvas({graph, focus}: {graph: QuantGraph; focus: (id: string) => void}) {
    const center = graph.nodes.find(node => node.id === `factor:${graph.focusId}`);
    if (!center) return null;
    const neighbors = graph.nodes.filter(node => node.kind === 'factor' && node.id !== center.id).slice(0, 8);
    const compact = neighbors.length <= 3;
    const centerX = compact ? 220 : 390, centerY = compact ? 130 : 240;
    const points = neighbors.map((node, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, neighbors.length);
        if (compact) return {node, x: 560, y: (index + 1) * 260 / (neighbors.length + 1)};
        return {node, x: 390 + 270 * Math.cos(angle), y: 240 + 170 * Math.sin(angle)};
    });
    const node = (item: QuantGraphNode, x: number, y: number, primary = false) => <g key={item.id}>
        <rect x={x - 90} y={y - 27} width={180} height={54} rx={14} fill={primary ? '#fff7ed' : '#ffffff'} stroke={primary ? '#fb923c' : '#cbd5e1'} />
        <text x={x} y={y + 5} textAnchor="middle" fill={primary ? '#9a3412' : '#334155'} fontSize={14}>{item.label.length > 11 ? `${item.label.slice(0, 11)}…` : item.label}</text>
    </g>;
    return <svg viewBox={`0 0 780 ${compact ? 260 : 480}`} className="mx-auto w-full max-w-[780px]" role="img" aria-label={`以${center.label}为中心的关系图，详细关系及切换操作见下方列表`}>
        {points.map(({node: item, x, y}) => {
            const edge = graph.edges.find(edge => (edge.from === center.id && edge.to === item.id) || (edge.to === center.id && edge.from === item.id));
            const semantic = edge?.kind === 'semantic_similar';
            return <line key={item.id} x1={centerX} y1={centerY} x2={x} y2={y} stroke={semantic ? '#d97706' : '#94a3b8'} strokeWidth={1.5} strokeDasharray={semantic ? '6 5' : undefined} />;
        })}
        {node(center, centerX, centerY, true)}
        {points.map(({node: item, x, y}) => <g key={item.id} className="cursor-pointer" onClick={() => focus(item.id.slice(7))}><title>{item.label}</title>{node(item, x, y)}</g>)}
    </svg>;
}
