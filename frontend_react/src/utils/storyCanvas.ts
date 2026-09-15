import type {ReadingGraph, ReadingNode} from '../types/bookAnalysis';
import {orderedEvents} from './readingChartOptions';

export const STORY_CARD_WIDTH = 248;
export const STORY_CARD_HEIGHT = 184;
export interface CanvasPoint {x: number; y: number}
export function storyCanvasLayout(nodes: ReadingNode[], order: 'narrative' | 'time', columns: number) {
    return orderedEvents(nodes, order).map((node, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return {node, index, x: 36 + column * (STORY_CARD_WIDTH + 80), y: 36 + row * (STORY_CARD_HEIGHT + 78)};
    });
}
export function storyCanvasLinks(graph: ReadingGraph, ids: string[]) {
    const known = new Set(ids);
    const recorded = graph.edges.filter(edge => ['causes', 'next'].includes(edge.kind) && known.has(edge.source) && known.has(edge.target));
    // Display order is intentionally derived separately from evidence-backed causality.
    const next = ids.slice(1).flatMap((target, i) => recorded.some(edge => edge.kind === 'next' && edge.source === ids[i] && edge.target === target) ? [] : [{id: `display-order-${ids[i]}-${target}`, source: ids[i], target, kind: 'next', label: '展示顺序'}]);
    return [...next, ...recorded];
}
export function storyLinkPath(source: CanvasPoint, target: CanvasPoint) {
    if (Math.abs(target.y - source.y) < STORY_CARD_HEIGHT / 2) {
        const forward = target.x > source.x;
        const startX = source.x + (forward ? STORY_CARD_WIDTH : 0);
        const endX = target.x + (forward ? 0 : STORY_CARD_WIDTH);
        const y1 = source.y + STORY_CARD_HEIGHT / 2;
        const y2 = target.y + STORY_CARD_HEIGHT / 2;
        return `M ${startX} ${y1} C ${(startX + endX) / 2} ${y1}, ${(startX + endX) / 2} ${y2}, ${endX} ${y2}`;
    }
    if (target.y > source.y && target.x < source.x) {
        // Wrap outside the cards, then enter the next row from its left edge.
        const startX = source.x + STORY_CARD_WIDTH;
        const y1 = source.y + STORY_CARD_HEIGHT / 2;
        const y2 = target.y + STORY_CARD_HEIGHT / 2;
        const lane = source.y + STORY_CARD_HEIGHT + 36;
        const left = Math.max(8, target.x - 24);
        return `M ${startX} ${y1} H ${startX + 24} V ${lane} H ${left} V ${y2} H ${target.x}`;
    }
    const forward = target.y > source.y;
    const x1 = source.x + STORY_CARD_WIDTH / 2;
    const x2 = target.x + STORY_CARD_WIDTH / 2;
    const y1 = source.y + (forward ? STORY_CARD_HEIGHT : 0);
    const y2 = target.y + (forward ? 0 : STORY_CARD_HEIGHT);
    return `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`;
}
