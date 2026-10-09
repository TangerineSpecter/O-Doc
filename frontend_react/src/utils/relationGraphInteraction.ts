import type {ECharts, ECElementEvent} from 'echarts/core';
import type {AgentRelationEdge, AgentRelationGraph} from '../types/api/setting';

type RelationFocus = {dataType: 'node' | 'edge'; dataIndex: number};
interface InteractionOptions {
    isCompact: () => boolean;
    onNodeFocus: (index: number | null) => void;
    onEdgeFocus: (edge: AgentRelationEdge | null) => void;
    onTooltipHide: () => void;
}

/** Keep hover cards independent from the simulation and freeze hover focus while dragging. */
export function installRelationGraphInteraction(chart: ECharts, graph: AgentRelationGraph, options: InteractionOptions) {
    let focus: RelationFocus | null = null;
    let hovered: RelationFocus | null = null;
    let appliedFocus: RelationFocus | null = null;
    let pressed: {x: number; y: number} | null = null;
    let moved = false;
    let suppressUntil = 0;
    let visible: RelationFocus | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let mutedRoots: {root: {silent: boolean}; silent: boolean}[] = [];
    const same = (a: RelationFocus | null, b: RelationFocus | null) => a?.dataType === b?.dataType && a?.dataIndex === b?.dataIndex;
    const hideTooltip = () => {
        clearTimeout(timer);
        visible = null;
        chart.dispatchAction({type: 'hideTip'});
        options.onTooltipHide();
    };
    const restoreFocus = () => {
        const active = hovered || focus;
        // Reapplying the same focus must not briefly clear blur on every drag frame.
        if (!same(appliedFocus, active)) {
            chart.dispatchAction({type: 'downplay', seriesIndex: 0, batch: [
                {dataType: 'node'}, {dataType: 'edge'},
            ]});
            appliedFocus = active;
        }
        if (!active) return;
        if (active.dataType === 'node') {
            const nodeId = graph.nodes[active.dataIndex].id;
            const indices = graph.edges.flatMap((edge, index) => edge.sourceId === nodeId || edge.targetId === nodeId ? [index] : []);
            chart.dispatchAction({type: 'highlight', seriesIndex: 0, batch: [
                {...active}, {dataType: 'edge', dataIndex: indices, notBlur: true},
            ]});
        } else chart.dispatchAction({type: 'highlight', seriesIndex: 0, ...active});
    };
    const scheduleTooltip = (active: RelationFocus) => {
        if (same(visible, active)) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (pressed || performance.now() < suppressUntil || !same(hovered, active)) return;
            visible = active;
            chart.dispatchAction({type: 'showTip', seriesIndex: 0, ...active});
        }, 180);
    };
    const hover = (params: ECElementEvent) => {
        if (pressed || performance.now() < suppressUntil || (params.dataType !== 'node' && params.dataType !== 'edge')) return;
        const active: RelationFocus = {dataType: params.dataType, dataIndex: params.dataIndex};
        if (!same(hovered, active)) {
            hideTooltip();
            hovered = active;
            cancelAnimationFrame(frame);
            // Apply after ECharts finishes its native hover state changes.
            frame = requestAnimationFrame(restoreFocus);
        }
        if (!options.isCompact()) scheduleTooltip(active);
    };
    const leave = () => {
        if (pressed) {
            restoreFocus();
            return;
        }
        hovered = null;
        hideTooltip();
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(restoreFocus);
    };
    const click = (params: ECElementEvent) => {
        if (performance.now() < suppressUntil) return;
        const active: RelationFocus = {dataType: params.dataType as RelationFocus['dataType'], dataIndex: params.dataIndex};
        if (params.dataType === 'node') {
            focus = same(focus, active) ? null : active;
            options.onNodeFocus(focus ? params.dataIndex : null);
            options.onEdgeFocus(null);
        } else if (params.dataType === 'edge') {
            focus = active;
            options.onNodeFocus(null);
            options.onEdgeFocus(graph.edges[params.dataIndex] || null);
        } else return;
        hovered = active;
        restoreFocus();
        if (options.isCompact()) {
            hideTooltip();
            visible = active;
            chart.dispatchAction({type: 'showTip', seriesIndex: 0, ...active});
        } else scheduleTooltip(active);
    };
    const zr = chart.getZr();
    const down = (event: {offsetX: number; offsetY: number}) => {
        pressed = {x: event.offsetX, y: event.offsetY};
        moved = false;
        hideTooltip();
    };
    const move = (event: {offsetX: number; offsetY: number}) => {
        if (!pressed) return;
        moved ||= Math.hypot(event.offsetX - pressed.x, event.offsetY - pressed.y) > 4;
        if (moved && !mutedRoots.length) {
            // The captured node still drags; moving shapes must not retarget native hover.
            mutedRoots = zr.storage.getRoots().map(root => ({root, silent: root.silent}));
            mutedRoots.forEach(({root}) => {root.silent = true;});
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(restoreFocus);
        }
    };
    const unmute = () => {
        mutedRoots.forEach(({root, silent}) => {root.silent = silent;});
        mutedRoots = [];
    };
    const up = () => {
        if (!pressed) return;
        unmute();
        pressed = null;
        if (moved) {
            suppressUntil = performance.now() + 200;
            hovered = null;
            restoreFocus();
        }
    };
    const blankClick = (event: {target?: unknown}) => {
        if (event.target || performance.now() < suppressUntil) return;
        focus = null;
        leave();
        options.onNodeFocus(null);
        options.onEdgeFocus(null);
    };
    chart.on('mouseover', hover);
    chart.on('mousemove', hover);
    chart.on('mouseout', leave);
    chart.on('click', click);
    zr.on('globalout', leave);
    zr.on('mousewheel', leave);
    zr.on('mousedown', down);
    zr.on('mousemove', move);
    zr.on('mouseup', up);
    zr.on('click', blankClick);
    return {
        restoreFocus,
        reset: () => {
            unmute();
            pressed = null;
            focus = null;
            hovered = null;
            appliedFocus = null;
            hideTooltip();
        },
        dispose: () => {
            unmute();
            clearTimeout(timer);
            cancelAnimationFrame(frame);
            chart.off('mouseover', hover); chart.off('mousemove', hover); chart.off('mouseout', leave); chart.off('click', click);
            zr.off('globalout', leave); zr.off('mousewheel', leave); zr.off('mousedown', down); zr.off('mousemove', move); zr.off('mouseup', up); zr.off('click', blankClick);
        },
    };
}
