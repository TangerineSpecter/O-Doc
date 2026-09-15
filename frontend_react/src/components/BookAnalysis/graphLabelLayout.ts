import type {ECharts} from 'echarts';
import type {ReadingGraph} from '../../types/bookAnalysis';

type Rect = {left: number; right: number; top: number; bottom: number};
const overlaps = (a: Rect, b: Rect) => a.left < b.right + 3 && a.right + 3 > b.left && a.top < b.bottom + 2 && a.bottom + 2 > b.top;

/** SVG fallback for force iterations: native labelLayout also runs on roam,
 * but moving nodes can change label positions between those layout passes. */
export function installGraphLabelLayout(chart: ECharts, root: HTMLElement, graph: ReadingGraph) {
    let frame = 0;
    let preferred = '';
    let related = new Set<string>();
    const layout = () => {
        frame = 0;
        const occupied: Rect[] = Array.from(root.querySelectorAll<SVGPathElement>('svg path'))
            .filter(path => !!path.getAttribute('fill') && !['none', '#ffffff', '#fff', 'white', 'rgb(255,255,255)'].includes(path.getAttribute('fill')!))
            .map(path => path.getBoundingClientRect());
        const labels = Array.from(root.querySelectorAll<SVGTextElement>('svg text'));
        const matches = (label: SVGTextElement, name: string) => {
            const text = label.textContent || '';
            return !!name && (text === name || (text.endsWith('…') && name.startsWith(text.slice(0, -1))) || (text.endsWith('...') && name.startsWith(text.slice(0, -3))));
        };
        const priority = (label: SVGTextElement) => matches(label, preferred) ? 2 : [...related].some(name => matches(label, name)) ? 1 : 0;
        labels.sort((a, b) => priority(b) - priority(a));
        for (const label of labels) {
            const bounds = label.getBoundingClientRect();
            const visible = matches(label, preferred) || !occupied.some(rect => overlaps(bounds, rect));
            label.style.visibility = visible ? 'visible' : 'hidden';
            if (visible) occupied.push(bounds);
        }
    };
    const schedule = () => {if (!frame) frame = requestAnimationFrame(layout);};
    const hover = (params: {name?: string; dataType?: string; data?: unknown}) => {
        if (params.dataType !== 'node') return;
        preferred = params.name || '';
        const id = (params.data as {id?: string} | undefined)?.id;
        const ids = new Set(graph.edges.filter(edge => edge.source === id || edge.target === id).flatMap(edge => [edge.source, edge.target]));
        related = new Set(graph.nodes.filter(node => ids.has(node.id)).map(node => node.name));
        schedule();
    };
    const leave = () => {preferred = ''; related = new Set(); schedule();};
    chart.on('rendered', schedule);
    chart.on('mouseover', hover);
    chart.on('mouseout', leave);
    chart.getZr().on('globalout', leave);
    chart.on('graphroam', schedule);
    schedule();
    return () => {
        cancelAnimationFrame(frame);
        chart.off('rendered', schedule);
        chart.off('mouseover', hover);
        chart.off('mouseout', leave);
        chart.getZr().off('globalout', leave);
        chart.off('graphroam', schedule);
    };
}
