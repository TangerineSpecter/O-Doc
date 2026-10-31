import type {QuantGraph, QuantGraphEdge} from '../types/api/quantGraph';

export type GraphView = 'algorithms' | 'records' | 'all';
export const graphViews: Record<GraphView, string> = {algorithms: '算法与属性', records: '来源与计算记录', all: '全部关系'};
const hypotheses: QuantGraphEdge['kind'][] = ['semantic_similar', 'complement_hypothesis', 'scenario_hypothesis', 'reported_support', 'reported_counterexample'];

export function graphRelations(graph: QuantGraph | undefined, view: GraphView) {
    const center = `factor:${graph?.focusId}`;
    return graph?.edges.filter(edge => (edge.from === center || edge.to === center) &&
        !hypotheses.includes(edge.kind) && (view === 'all' || ['attribute_similar', 'same_expression', 'same_source'].includes(edge.kind) === (view === 'algorithms'))) || [];
}

/** SVG labels remain bounded; the full name is always available in the title and text list. */
export function graphLabelLines(label: string): string[] {
    const chunks: string[] = [];
    const totalWidth = [...label].reduce((sum, char) => sum + (char.codePointAt(0)! > 255 ? 2 : 1), 0);
    const lineWidth = totalWidth <= 72 ? Math.ceil(totalWidth / Math.max(1, Math.ceil(totalWidth / 24))) : 24;
    let line = '', width = 0;
    for (const char of label) {
        const size = char.codePointAt(0)! > 255 ? 2 : 1;
        if (width + size > lineWidth) {chunks.push(line); line = ''; width = 0;}
        line += char; width += size;
    }
    chunks.push(line);
    return chunks.length > 3 ? [chunks[0], chunks[1], [...chunks[2]].slice(0, -1).join('') + '…'] : chunks;
}
