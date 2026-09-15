import {useEffect, useRef, useState} from 'react';
import type {EChartsOption} from 'echarts';
import type {GraphView, ReadingGraph} from '../../types/bookAnalysis';
import {buildReadingTree, nodeColors, nodeLabels} from '../../utils/readingGraph';
import {relationChartOption} from '../../utils/readingChartOptions';
import {installGraphLabelLayout} from './graphLabelLayout';
import {installGraphViewport} from './graphViewport';
import {installGraphHover} from './graphHover';

interface Props {graph: ReadingGraph; view: GraphView; title: string; order: 'narrative' | 'time'; onSelect: (id: string) => void; onEdge: (id: string) => void}
export default function ReadingChart({graph, view, title, order, onSelect, onEdge}: Props) {
    const root = useRef<HTMLDivElement>(null);
    const reset = useRef<() => void>(() => undefined);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!root.current || !graph.nodes.length) return;
        let disposed = false;
        let chart: import('echarts').ECharts | undefined;
        let observer: ResizeObserver | undefined;
        let releaseLabels: (() => void) | undefined;
        let viewport: ReturnType<typeof installGraphViewport> | undefined;
        let releaseHover: (() => void) | undefined;
        void import('echarts').then(echarts => {
            if (disposed || !root.current) return;
            chart = echarts.init(root.current, undefined, {renderer: 'svg'});
            let option: EChartsOption = view === 'mindmap' ? {
                tooltip: {show: false},
                series: [{type: 'tree', data: [buildReadingTree(graph, title)], top: '8%', bottom: '8%', left: '12%', right: '24%', roam: true, symbolSize: 10, initialTreeDepth: 2, expandAndCollapse: true, label: {position: 'left', fontSize: 12, color: '#334155'}, leaves: {label: {position: 'right'}}, lineStyle: {color: '#cbd5e1', width: 1.5}, itemStyle: {color: '#f97316'}, animationDurationUpdate: 200}],
            } : relationChartOption(graph, chart.getWidth(), chart.getHeight());
            chart.setOption(option);
            if (view === 'graph') {
                releaseLabels = installGraphLabelLayout(chart, root.current, graph);
                viewport = installGraphViewport(chart);
                releaseHover = installGraphHover(chart, graph);
            }
            reset.current = () => {if (viewport) viewport.fit(); else chart?.setOption(option, {notMerge: true});};
            let down: {x: number; y: number} | null = null;
            let dragged = false;
            chart.getZr().on('mousedown', event => {down = {x: event.offsetX, y: event.offsetY}; dragged = false;});
            chart.getZr().on('mousemove', event => {if (down && Math.hypot(event.offsetX - down.x, event.offsetY - down.y) > 4) dragged = true;});
            chart.getZr().on('mouseup', () => {down = null;});
            chart.getZr().on('globalout', () => {down = null;});
            chart.on('click', params => {
                if (dragged) return;
                const data = params.data as {id?: string} | undefined;
                if (!data?.id) return;
                if (params.dataType === 'edge') onEdge(data.id);
                else onSelect(data.id);
            });
            let width = root.current.clientWidth;
            let height = root.current.clientHeight;
            observer = new ResizeObserver(() => {
                if (!root.current || !chart) return;
                const nextWidth = root.current.clientWidth;
                const nextHeight = root.current.clientHeight;
                if (width === nextWidth && height === nextHeight) return;
                width = nextWidth;
                height = nextHeight;
                chart.resize();
                if (view === 'graph') option = relationChartOption(graph, chart.getWidth(), chart.getHeight());
                // Force layout preserves old pixel positions across resize.
                // Recreate the series to fit the new viewport, including zoom.
                chart.setOption(option, {notMerge: true});
                viewport?.dispose();
                if (view === 'graph') viewport = installGraphViewport(chart);
            });
            observer.observe(root.current);
        }).catch(() => {if (!disposed) setError('图形加载失败，请刷新页面；下方列表仍可浏览。');});
        return () => {disposed = true; reset.current = () => undefined; observer?.disconnect(); releaseLabels?.(); viewport?.dispose(); releaseHover?.(); chart?.dispose();};
    }, [graph, view, title, order, onSelect, onEdge]);
    return <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:18px_18px]">
        {view === 'graph' && <div className="absolute left-4 right-28 top-3 z-10 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">{Object.entries(nodeLabels).filter(([kind]) => graph.nodes.some(n => n.kind === kind)).map(([kind, label]) => <span key={kind} className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{background: nodeColors[kind as keyof typeof nodeColors]}}/>{label}</span>)}</div>}
        <div ref={root} className="h-[640px] w-full" role="img" aria-label={view === 'flow' ? '可点击的故事情节流程图' : view === 'mindmap' ? '可点击的知识思维导图' : '可点击的书籍知识图谱'}/>
        <button onClick={() => reset.current()} className="absolute right-4 top-3 z-20 rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] text-slate-500 hover:border-orange-200 hover:text-orange-600">重置视图</button>
        <span className="pointer-events-none absolute bottom-3 left-4 max-w-[70%] text-[10px] text-slate-400">滚轮缩放 · 拖动节点或空白画布 · 标签自动避让</span>
        {error && <p role="alert" className="absolute inset-x-4 top-4 rounded-lg bg-white p-3 text-sm text-red-600">{error}</p>}
    </div>;
}
