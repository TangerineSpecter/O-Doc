import type {EChartsOption, GraphSeriesOption} from 'echarts';
import type {ReadingGraph, ReadingNode} from '../types/bookAnalysis';
import {nodeColors} from './readingGraph';

export function orderedEvents(nodes: ReadingNode[], order: 'narrative' | 'time') {
    return [...nodes].sort((a, b) => order === 'time' ? Number(a.timeOrder === '') - Number(b.timeOrder === '') || a.timeOrder.localeCompare(b.timeOrder) || a.ordinal - b.ordinal : a.ordinal - b.ordinal);
}

export function relationChartOption(graph: ReadingGraph, width = 1000, height = 480): EChartsOption {
    const degree = new Map<string, number>();
    graph.edges.forEach(edge => [edge.source, edge.target].forEach(id => degree.set(id, (degree.get(id) || 0) + 1)));
    return {
        tooltip: {show: false},
        series: [{
            type: 'graph', left: 65, right: 65, top: 60, bottom: 65,
            // No explicit grid coordinates: their degenerate Y extent stretched
            // circles into ellipses/bars. The view now starts in canvas space.
            layout: 'force', preserveAspect: 'contain', roam: true, draggable: true,
            // ECharts 6 declares this numeric option as the literal default .6.
            // The viewport adapter fits the settled positions, not this
            // initial circular layout. Keep node sizes independent of zoom.
            zoom: Math.min(.8, Math.max(.45, Math.min(width, height) / 800)),
            scaleLimit: {min: .15, max: 3}, nodeScaleRatio: 0 as GraphSeriesOption['nodeScaleRatio'],
            force: {initLayout: 'circular', repulsion: [900, 1800], edgeLength: [170, 270], gravity: .025, friction: .65, layoutAnimation: true},
            labelLayout: {hideOverlap: true},
            data: graph.nodes.map(node => ({
                id: node.id, name: node.name, symbol: 'circle', draggable: true, cursor: 'grab', value: degree.get(node.id) || 1,
                symbolSize: Math.min(23, 9 + Math.sqrt(degree.get(node.id) || 0) * 3),
                itemStyle: {color: nodeColors[node.kind], borderColor: '#ffffff', borderWidth: 1.5},
                label: {show: true, position: 'bottom', distance: 9, width: 120, overflow: 'truncate', color: '#475569', fontSize: 11},
                emphasis: {label: {show: true, overflow: 'truncate', width: 180, color: '#0f172a', opacity: 1, fontWeight: 'bold'}, itemStyle: {opacity: 1, borderColor: '#8b5cf6', borderWidth: 2}},
            })),
            links: graph.edges.map(edge => ({id: edge.id, source: edge.source, target: edge.target, lineStyle: {color: edge.origin === 'inferred' ? '#a855f7' : edge.kind === 'causes' ? '#fb923c' : '#b8c4d1', type: edge.origin === 'inferred' || edge.kind === 'next' ? 'dashed' : 'solid', opacity: .38}, emphasis: {lineStyle: {color: '#8b5cf6', opacity: 1, width: 1}}, blur: {lineStyle: {opacity: .04}}})),
            edgeSymbol: ['none', 'none'], emphasis: {focus: 'adjacency', blurScope: 'series', lineStyle: {color: '#8b5cf6', opacity: 1, width: 1}},
            blur: {itemStyle: {opacity: .12}, lineStyle: {opacity: .04}, label: {opacity: .12}},
            lineStyle: {curveness: .06, width: 1}, animationDuration: 0, stateAnimation: {duration: 0},
        } as GraphSeriesOption],
    };
}
