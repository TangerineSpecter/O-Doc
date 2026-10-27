import type {QuantGraph, QuantGraphNode} from '../../types/api/quantGraph';

/** A focused, bounded overview; every relationship is also available as text. */
export function FactorGraphCanvas({graph, focus}: {graph: QuantGraph; focus: (id: string) => void}) {
    const center = graph.nodes.find(node => node.id === `factor:${graph.focusId}`);
    if (!center) return null;
    const adjacent = new Set(graph.edges.flatMap(edge => edge.from === center.id ? [edge.to] : edge.to === center.id ? [edge.from] : []));
    const neighbors = graph.nodes.filter(node => !['report','source'].includes(node.kind) && node.id !== center.id && adjacent.has(node.id)).slice(0, 8);
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
            const links=graph.edges.filter(edge => (edge.from === center.id && edge.to === item.id) || (edge.to === center.id && edge.from === item.id));
            const edge=links.find(edge=>edge.kind==='statistical_correlation')||links[0];
            const semantic = edge?.kind === 'semantic_similar';
            const hypothesis = edge?.kind === 'complement_hypothesis' || edge?.kind === 'scenario_hypothesis';
            const reported = edge?.kind.startsWith('reported_');
            const color = semantic ? '#d97706' : hypothesis ? '#7c3aed' : edge?.kind === 'combination_supports' ? '#4d7c0f' : edge?.kind === 'combination_counterexample' ? '#b91c1c' : edge?.kind === 'statistical_correlation' ? '#0f766e' : '#94a3b8';
            return <line key={item.id} x1={centerX} y1={centerY} x2={x} y2={y} stroke={color} strokeWidth={1.5} strokeDasharray={semantic || hypothesis ? '6 5' : reported ? '2 5' : undefined} />;
        })}
        {node(center, centerX, centerY, true)}
        {points.map(({node: item, x, y}) => <g key={item.id} className={item.kind==='factor'?'cursor-pointer':undefined} onClick={item.kind==='factor'?() => focus(item.id.slice(7)):undefined}><title>{item.label} · {item.kind==='factor'?'点击切换研究中心':'完整依据与操作见下方列表'}</title>{node(item, x, y)}</g>)}
    </svg>;
}
