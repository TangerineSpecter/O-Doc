import {factorName} from '../../utils/quantFactorName';
import {graphLabelLines} from '../../utils/quantGraphView';
import type {QuantGraph, QuantGraphNode} from '../../types/api/quantGraph';

/** A focused, bounded overview; every relationship is also available as text. */
export function FactorGraphCanvas({graph, focus}: {graph: QuantGraph; focus: (id: string) => void}) {
    const center = graph.nodes.find(node => node.id === `factor:${graph.focusId}`);
    if (!center) return null;
    const adjacent = new Set(graph.edges.flatMap(edge => edge.from === center.id ? [edge.to] : edge.to === center.id ? [edge.from] : []));
    const neighbors = graph.nodes.filter(node => !['report','source'].includes(node.kind) && node.id !== center.id && adjacent.has(node.id)).slice(0, 8);
    const compact = neighbors.length <= 3;
    const height = compact ? Math.max(160, neighbors.length * 80 + 60) : 560;
    const centerX = compact ? 200 : 450, centerY = height / 2;
    const points = neighbors.map((node, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(1, neighbors.length);
        if (compact) return {node, x: 650, y: (index + 1) * height / (neighbors.length + 1)};
        return {node, x: 450 + 330 * Math.cos(angle), y: 280 + 200 * Math.sin(angle)};
    });
    const node = (item: QuantGraphNode, x: number, y: number, primary = false) => {
        const name = factorName(item.label, item.originalName);
        const identifier = name.identifier.length > 28 ? name.identifier.slice(0, 27) + '…' : name.identifier;
        return <g key={item.id}>
            <rect x={x - 110} y={y - 42} width={220} height={84} rx={14} fill={primary ? '#fff7ed' : '#ffffff'} stroke={primary ? '#fb923c' : '#cbd5e1'} />
            <title>{name.title}{name.identifier ? ` · ${name.identifier}` : ''}</title>
            <text textAnchor="middle" fill={primary ? '#9a3412' : '#334155'} fontSize={13} fontWeight={600}>
                {graphLabelLines(name.title).map((line, index, lines) => <tspan key={index} x={x} y={y + (index - (lines.length - 1) / 2) * 16 + (identifier ? -5 : 4)}>{line}</tspan>)}
            </text>
            {identifier && <text x={x} y={y + 27} textAnchor="middle" fill="#64748b" fontSize={11}>{identifier}</text>}
        </g>;
    };
    return <><p className="mt-4 text-xs text-slate-500 lg:hidden">横向滑动查看完整图谱；完整名称及关系依据也可在下方列表查看。</p><div className="max-w-full overflow-x-auto scrollbar-hide"><svg viewBox={`0 0 900 ${height}`} className="mx-auto w-full min-w-[900px] max-w-[1000px]" role="group" aria-label={`以${center.label}为中心的关系图，详细关系及切换操作见下方列表`}>
        {points.map(({node: item, x, y}) => {
            const links=graph.edges.filter(edge => (edge.from === center.id && edge.to === item.id) || (edge.to === center.id && edge.from === item.id));
            const edge=links.find(edge=>edge.kind==='statistical_correlation')||links[0];
            const semantic = edge?.kind === 'semantic_similar';
            const hypothesis = edge?.kind === 'complement_hypothesis' || edge?.kind === 'scenario_hypothesis';
            const reported = edge?.kind.startsWith('reported_');
            const color = semantic ? '#d97706' : hypothesis ? '#7c3aed' : edge?.kind === 'combination_supports' ? '#4d7c0f' : edge?.kind === 'combination_counterexample' ? '#b91c1c' : edge?.kind === 'statistical_correlation' ? '#0f766e' : '#94a3b8';
            return <g key={item.id}><line x1={centerX} y1={centerY} x2={x} y2={y} stroke={color} strokeWidth={1.5} strokeDasharray={semantic || hypothesis ? '6 5' : reported ? '2 5' : undefined} />
                {edge?.kind === 'attribute_similar' && edge.similarity !== null && <g transform={`translate(${(centerX+x)/2},${(centerY+y)/2})`}>
                    <rect x={-52} y={-10} width={104} height={20} rx={4} fill="white"/>
                    <text textAnchor="middle" y={4} fill="#475569" fontSize={11}>属性相似 {(edge.similarity*100).toFixed(1)}%</text>
                </g>}</g>;
        })}
        {node(center, centerX, centerY, true)}
        {points.map(({node: item, x, y}) => <g key={item.id} role={item.kind==='factor'?'button':undefined} tabIndex={item.kind==='factor'?0:undefined} aria-label={item.kind==='factor'?`以${item.label}为中心`:undefined} onKeyDown={item.kind==='factor'?event => {if(event.key==='Enter'||event.key===' '){event.preventDefault();focus(item.id.slice(7));}}:undefined} className={item.kind==='factor'?'cursor-pointer focus:outline-orange-500':undefined} onClick={item.kind==='factor'?() => focus(item.id.slice(7)):undefined}><title>{item.label} · {item.kind==='factor'?'点击切换研究中心':'完整依据与操作见下方列表'}</title>{node(item, x, y)}</g>)}
    </svg></div></>;
}
