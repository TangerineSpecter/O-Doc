import {useEffect, useRef, useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import type {CanvasPoint} from '../utils/storyCanvas';

interface Transform {x: number; y: number; scale: number}
interface Drag {pointer: number; start: CanvasPoint; origin: CanvasPoint; nodeId: string; moved: boolean}
export function useStoryCanvas() {
    const root = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(900);
    const [transform, setTransform] = useState<Transform>({x: 0, y: 0, scale: 1});
    const current = useRef(transform);
    const [positions, setPositions] = useState<Record<string, CanvasPoint>>({});
    const drag = useRef<Drag | null>(null);
    const suppressClick = useRef(false);
    const update = (value: Transform) => {current.current = value; setTransform(value);};
    const zoom = (factor: number, anchor?: CanvasPoint) => {
        const old = current.current;
        const center = anchor || {x: (root.current?.clientWidth || 900) / 2, y: (root.current?.clientHeight || 640) / 2};
        const scale = Math.max(.2, Math.min(2, old.scale * factor));
        update({scale, x: center.x - (center.x - old.x) * scale / old.scale, y: center.y - (center.y - old.y) * scale / old.scale});
    };
    useEffect(() => {
        const element = root.current;
        if (!element) return;
        const observer = new ResizeObserver(() => {setWidth(element.clientWidth);});
        observer.observe(element);
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const bounds = element.getBoundingClientRect();
            const old = current.current;
            const scale = Math.max(.2, Math.min(2, old.scale * Math.exp(-event.deltaY * .0015)));
            const x = event.clientX - bounds.left;
            const y = event.clientY - bounds.top;
            const next = {scale, x: x - (x - old.x) * scale / old.scale, y: y - (y - old.y) * scale / old.scale};
            current.current = next;
            setTransform(next);
        };
        element.addEventListener('wheel', wheel, {passive: false});
        return () => {observer.disconnect(); element.removeEventListener('wheel', wheel);};
    }, []);
    const pointerDown = (event: ReactPointerEvent<HTMLDivElement>, points: Record<string, CanvasPoint>) => {
        if (event.button !== 0) return;
        const element = event.target instanceof Element ? event.target : null;
        const nodeId = element?.closest<HTMLElement>('[data-flow-node]')?.dataset.flowNode || '';
        if (!nodeId && element?.closest('button')) return;
        suppressClick.current = false;
        drag.current = {pointer: event.pointerId, start: {x: event.clientX, y: event.clientY}, origin: nodeId ? points[nodeId] : current.current, nodeId, moved: false};
    };
    const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        const dx = event.clientX - active.start.x;
        const dy = event.clientY - active.start.y;
        if (Math.hypot(dx, dy) < 4 && !active.moved) return;
        active.moved = true;
        suppressClick.current = true;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
        if (active.nodeId) setPositions(old => ({...old, [active.nodeId]: {x: Math.max(0, active.origin.x + dx / current.current.scale), y: Math.max(0, active.origin.y + dy / current.current.scale)}}));
        else update({...current.current, x: active.origin.x + dx, y: active.origin.y + dy});
    };
    const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (drag.current?.pointer !== event.pointerId) return;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const reset = () => {setPositions({}); update({x: 0, y: 0, scale: 1});};
    return {root, width, transform, positions, suppressClick, zoom, reset, pointerDown, pointerMove, pointerUp};
}
