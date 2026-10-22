import {colliders, FOOT_RADIUS, GROUND_Y, walkingBounds} from './worldMap';
import type {Point, Shape} from './types';

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function contains(shape: Shape, point: Point, padding = 0): boolean {
    if (shape.kind === 'rect') return point.x >= shape.x - padding && point.x <= shape.x + shape.w + padding
        && point.y >= shape.y - padding && point.y <= shape.y + shape.h + padding;
    if (shape.kind === 'ellipse') return ((point.x - shape.x) / (shape.rx + padding)) ** 2 + ((point.y - shape.y) / (shape.ry + padding)) ** 2 <= 1;
    let inside = false;
    for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {
        const a = shape.points[i], b = shape.points[j];
        if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

export function isWalkable(point: Point, obstacles: Shape[] = colliders): boolean {
    return point.x >= walkingBounds.left && point.x <= walkingBounds.right && point.y <= GROUND_Y + .1
        && !obstacles.some(shape => contains(shape, point, FOOT_RADIUS));
}

export function segmentClear(a: Point, b: Point, obstacles: Shape[] = colliders): boolean {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 2));
    for (let i = 0; i <= steps; i++) if (!isWalkable({x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps}, obstacles)) return false;
    return true;
}

/** Ground clicks change X only. Vertical motion is exclusively a jump arc, never depth movement. */
export function nearbyWalkable(point: Point, radius = 65): Point | null {
    for (let offset = 0; offset <= radius; offset += 2) for (const sign of [-1, 1]) {
        const candidate = {x: point.x + offset * sign, y: GROUND_Y};
        if (isWalkable(candidate)) return candidate;
    }
    return null;
}

/** Side-scrolling route: walk on one floor and jump over solid intervals. No front/back lane. */
export function findPath(start: Point, destination: Point, extraObstacles: Shape[] = []): Point[] | null {
    const obstacles = [...colliders, ...extraObstacles];
    if (Math.abs(start.y - GROUND_Y) > 1 || !isWalkable(start, obstacles) || !isWalkable(destination, obstacles)) return null;
    const direction = destination.x >= start.x ? 1 : -1;
    const left = Math.min(start.x, destination.x), right = Math.max(start.x, destination.x);
    const crossed = obstacles.filter((shape): shape is Extract<Shape, {kind: 'rect'}> => shape.kind === 'rect'
        && shape.x + shape.w + FOOT_RADIUS > left && shape.x - FOOT_RADIUS < right)
        .sort((a, b) => direction * (a.x - b.x));
    const path: Point[] = [];
    let previous = start;
    for (const obstacle of crossed) {
        const edge = direction > 0 ? obstacle.x : obstacle.x + obstacle.w;
        const takeoff = {x: edge - direction * (FOOT_RADIUS + 29), y: GROUND_Y};
        const landing = {x: edge + direction * (obstacle.w + FOOT_RADIUS + 29), y: GROUND_Y};
        takeoff.x = direction > 0 ? Math.max(previous.x, takeoff.x) : Math.min(previous.x, takeoff.x);
        landing.x = direction > 0 ? Math.min(destination.x, landing.x) : Math.max(destination.x, landing.x);
        if (Math.abs(takeoff.x - previous.x) > .1) path.push(takeoff);
        const height = Math.max(65, GROUND_Y - obstacle.y + 43);
        const steps = Math.max(20, Math.ceil(Math.abs(landing.x - takeoff.x) / 3));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            path.push({x: takeoff.x + (landing.x - takeoff.x) * t, y: GROUND_Y - 4 * height * t * (1 - t)});
        }
        previous = landing;
    }
    path.push({x: destination.x, y: GROUND_Y});
    let anchor = start;
    for (const point of path) {if (!segmentClear(anchor, point, obstacles)) return null; anchor = point;}
    return path;
}
