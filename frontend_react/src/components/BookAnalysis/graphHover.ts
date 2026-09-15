import type {ECharts} from 'echarts';
import type {ReadingGraph} from '../../types/bookAnalysis';

interface HighlightTarget {seriesIndex: number; dataType: 'node' | 'edge'; dataIndex: number | number[]; notBlur?: boolean}

/** Focus alone only exempts adjacent items from blur; explicitly emphasize
 * the one-hop neighborhood without expanding focus to their own neighbors. */
export function installGraphHover(chart: ECharts, graph: ReadingGraph) {
    let targets: HighlightTarget[] = [];
    const clear = () => {
        if (!targets.length) return;
        const previous = targets;
        targets = [];
        chart.dispatchAction({type: 'downplay', batch: previous}, {silent: true});
    };
    const hover = (params: {dataType?: string; data?: unknown}) => {
        if (params.dataType !== 'node') return;
        const id = (params.data as {id?: string} | undefined)?.id;
        const index = graph.nodes.findIndex(node => node.id === id);
        if (index < 0) return;
        clear();
        const neighbors = new Set<string>();
        const edges: number[] = [];
        graph.edges.forEach((edge, edgeIndex) => {
            if (edge.source === id || edge.target === id) {
                edges.push(edgeIndex);
                neighbors.add(edge.source);
                neighbors.add(edge.target);
            }
        });
        const nodes = graph.nodes.flatMap((node, nodeIndex) => node.id !== id && neighbors.has(node.id) ? [nodeIndex] : []);
        // A single batch clears previous blur once. Only the primary target
        // defines focus; subsequent targets highlight without redefining blur.
        targets = [{seriesIndex: 0, dataType: 'node', dataIndex: index}];
        if (nodes.length) targets.push({seriesIndex: 0, dataType: 'node', dataIndex: nodes, notBlur: true});
        if (edges.length) targets.push({seriesIndex: 0, dataType: 'edge', dataIndex: edges, notBlur: true});
        chart.dispatchAction({type: 'highlight', batch: targets}, {silent: true});
    };
    const leave = (params: {dataType?: string}) => {if (params.dataType === 'node') clear();};
    chart.on('mouseover', hover);
    chart.on('mouseout', leave);
    chart.getZr().on('globalout', clear);
    return () => {chart.off('mouseover', hover); chart.off('mouseout', leave); chart.getZr().off('globalout', clear); clear();};
}
