import {useEffect, useEffectEvent, useRef, useState} from 'react';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import type {AgentRelationEdge, AgentRelationGraph} from '../types/api/setting';
import {circularRelationAvatar} from '../utils/relationAvatar';
import {isRelationImageAvatar, relationGraphNodes, relationGraphOption} from '../utils/relationGraph';
import {chooseRelationTooltipPosition, relationTooltipScene} from '../utils/relationTooltipLayout';
import {installRelationGraphViewport} from '../utils/relationGraphViewport';
import {installRelationGraphInteraction} from '../utils/relationGraphInteraction';

echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

export function useAgentRelationChart(graph: AgentRelationGraph | null, ready: boolean,
    onSelectEdge: (edge: AgentRelationEdge | null) => void) {
    const chartRef = useRef<HTMLDivElement>(null);
    const resetRef = useRef<(() => void) | null>(null);
    const [focused, setFocused] = useState<{graph: AgentRelationGraph; nodeId: string} | null>(null);
    const notifyEdge = useEffectEvent(onSelectEdge);
    const focusedNode = focused?.graph === graph ? graph?.nodes.find(node => node.id === focused.nodeId) || null : null;

    useEffect(() => {
        if (!chartRef.current || !ready || !graph?.nodes.length) return;
        const element = chartRef.current;
        const chart = echarts.init(element);
        let disposed = false;
        let tooltipPosition: number[] | null = null;
        let compact = element.clientWidth < 600;
        let layoutWidth = element.clientWidth;
        const size = (): [number, number] => [element.clientWidth, element.clientHeight];
        let symbols: (string | null)[] | undefined;
        const draw = () => {
            const option = relationGraphOption(graph, compact, size());
            if (option.tooltip && !Array.isArray(option.tooltip)) {
                option.tooltip.position = (point, _params, tooltip, rect, size) => {
                    // Choose free space once per hover, rather than chasing moving nodes.
                    if (tooltipPosition) return tooltipPosition;
                    const hovered = rect || {x: point[0], y: point[1], width: 1, height: 1};
                    const scene = relationTooltipScene(chart.getZr().storage.getDisplayList(), hovered);
                    const container = tooltip instanceof HTMLElement ? tooltip : null;
                    container?.classList.remove('is-compact');
                    const measure = (): [number, number] => container
                        ? [container.offsetWidth, container.offsetHeight] : size.contentSize;
                    let layout = chooseRelationTooltipPosition(hovered, measure(), size.viewSize, scene);
                    if (layout.overlap && container) {
                        container.classList.add('is-compact');
                        layout = chooseRelationTooltipPosition(hovered, measure(), size.viewSize, scene);
                    }
                    tooltipPosition = layout.position;
                    return tooltipPosition;
                };
            }
            chart.setOption(option, true);
            if (symbols) chart.setOption({series: [{data: relationGraphNodes(graph, compact, symbols, size())}]});
        };
        draw();
        const interaction = installRelationGraphInteraction(chart, graph, {
            isCompact: () => compact,
            onNodeFocus: index => setFocused(index === null ? null : {graph, nodeId: graph.nodes[index].id}),
            onEdgeFocus: edge => notifyEdge(edge),
            onTooltipHide: () => {tooltipPosition = null;},
        });
        resetRef.current = () => {
            interaction.reset();
            chart.clear();
            draw();
            viewport.fit();
        };
        const viewport = installRelationGraphViewport(chart, interaction.restoreFocus);
        void Promise.all(graph.nodes.map(node => isRelationImageAvatar(node.avatar)
            ? circularRelationAvatar(node.avatar) : Promise.resolve(null))).then(loaded => {
            if (disposed) return;
            symbols = loaded;
            chart.setOption({series: [{data: relationGraphNodes(graph, compact, loaded, size())}]});
            interaction.restoreFocus();
        });
        const observer = new ResizeObserver(() => {
            tooltipPosition = null;
            chart.resize();
            const nextCompact = element.clientWidth < 600;
            if (nextCompact !== compact || element.clientWidth !== layoutWidth) {
                compact = nextCompact;
                layoutWidth = element.clientWidth;
                draw();
                viewport.fit();
            }
            interaction.restoreFocus();
        });
        observer.observe(element);
        return () => {
            disposed = true;
            interaction.dispose();
            observer.disconnect();
            viewport.dispose();
            resetRef.current = null;
            chart.dispose();
        };
    }, [graph, ready]);

    const resetView = () => {
        setFocused(null);
        onSelectEdge(null);
        resetRef.current?.();
    };

    return {chartRef, focusedNode, resetView};
}
