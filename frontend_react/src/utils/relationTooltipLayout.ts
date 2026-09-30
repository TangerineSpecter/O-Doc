import type {EChartsType} from 'echarts/core';

type Displayable = ReturnType<ReturnType<EChartsType['getZr']>['storage']['getDisplayList']>[number];

export interface RelationTooltipRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

type Point = [number, number];
interface Obstacle extends RelationTooltipRect {weight: number}
interface Segment {start: Point; end: Point; weight: number}
interface Curve extends Displayable {pointAt: (t: number) => number[]}

const expand = (rect: RelationTooltipRect, gap: number): RelationTooltipRect => ({
    x: rect.x - gap, y: rect.y - gap, width: rect.width + gap * 2, height: rect.height + gap * 2,
});

const contains = (rect: RelationTooltipRect, [x, y]: Point) =>
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

const overlapArea = (a: RelationTooltipRect, b: RelationTooltipRect) =>
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

function segmentIntersects(rect: RelationTooltipRect, {start, end}: Segment): boolean {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const p = [-dx, dx, -dy, dy];
    const q = [start[0] - rect.x, rect.x + rect.width - start[0], start[1] - rect.y, rect.y + rect.height - start[1]];
    let low = 0;
    let high = 1;
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return false;
            continue;
        }
        const t = q[i] / p[i];
        if (p[i] < 0) low = Math.max(low, t);
        else high = Math.min(high, t);
        if (low > high) return false;
    }
    return true;
}

/** Read rendered geometry so force layout, dragging and zooming use the same coordinates as the tooltip. */
export function relationTooltipScene(elements: Displayable[], hovered: RelationTooltipRect) {
    const curves = elements.filter((element): element is Curve =>
        element.type === 'ec-line' && 'pointAt' in element && typeof element.pointAt === 'function');
    const toGlobal = (curve: Curve, t: number): Point => {
        const point = curve.pointAt(t);
        return curve.transformCoordToGlobal(point[0], point[1]) as Point;
    };
    const relatedEnds: Point[] = [];
    const segments: Segment[] = [];
    for (const curve of curves) {
        const ends = [toGlobal(curve, 0), toGlobal(curve, 1)];
        const related = ends.some(point => contains(expand(hovered, 12), point));
        if (related) relatedEnds.push(...ends);
        let start = ends[0];
        for (let i = 1; i <= 24; i++) {
            const end = toGlobal(curve, i / 24);
            segments.push({start, end, weight: related ? 800 : 80});
            start = end;
        }
    }
    const obstacles: Obstacle[] = [{...expand(hovered, 6), weight: 300}];
    for (const element of elements) {
        if (element.type !== 'image' && element.type !== 'tspan') continue;
        const bounds = element.getBoundingRect().clone();
        bounds.applyTransform(element.getComputedTransform());
        const related = overlapArea(bounds, hovered) > 0 || relatedEnds.some(point => contains(expand(bounds, 12), point));
        obstacles.push({...expand(bounds, 6), weight: element.type === 'image' ? (related ? 300 : 100) : 20});
    }
    return {obstacles, segments};
}

/** Prefer nearby free space; related avatars and curved edges take priority over pointer proximity. */
export function chooseRelationTooltipPosition(
    hovered: RelationTooltipRect,
    contentSize: [number, number],
    viewSize: [number, number],
    scene: ReturnType<typeof relationTooltipScene>,
): {position: Point; overlap: boolean} {
    const margin = 12;
    const gap = 16;
    const width = Math.min(contentSize[0], Math.max(0, viewSize[0] - margin * 2));
    const height = Math.min(contentSize[1], Math.max(0, viewSize[1] - margin * 2));
    const maxX = Math.max(margin, viewSize[0] - width - margin);
    const maxY = Math.max(margin, viewSize[1] - height - margin);
    const center: Point = [hovered.x + hovered.width / 2, hovered.y + hovered.height / 2];
    const candidates: Point[] = [];
    const xs = [hovered.x - width - gap, center[0] - width / 2, hovered.x + hovered.width + gap];
    const ys = [hovered.y - height - gap, center[1] - height / 2, hovered.y + hovered.height + gap];
    for (const x of xs) for (const y of ys) candidates.push([x, y]);
    // Scan the viewport as well: the nearest side can be filled by the relationship cluster.
    for (let x = 0; x <= 8; x++) for (let y = 0; y <= 6; y++) {
        candidates.push([margin + (maxX - margin) * x / 8, margin + (maxY - margin) * y / 6]);
    }
    let best: Point = [margin, margin];
    let bestScore = Infinity;
    let bestCollision = Infinity;
    for (const candidate of candidates) {
        const position: Point = [Math.max(margin, Math.min(maxX, candidate[0])), Math.max(margin, Math.min(maxY, candidate[1]))];
        const rect = {x: position[0], y: position[1], width, height};
        const collision = scene.obstacles.reduce((sum, obstacle) => sum + overlapArea(rect, obstacle) * obstacle.weight, 0)
            + scene.segments.reduce((sum, segment) => sum + (segmentIntersects(expand(rect, 4), segment) ? segment.weight : 0), 0);
        const distance = Math.hypot(position[0] + width / 2 - center[0], position[1] + height / 2 - center[1]);
        if (collision < bestCollision || (collision === bestCollision && distance < bestScore)) {
            best = position;
            bestCollision = collision;
            bestScore = distance;
        }
    }
    return {position: best, overlap: bestCollision > 0};
}
