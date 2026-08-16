import type { HandlePosition, WhiteboardNode } from '../types/whiteboard';

// 获取节点锚点坐标
export const getHandleCoords = (node: WhiteboardNode, handle: HandlePosition) => {
    const { x, y, width, height } = node;
    switch (handle) {
        case 'top': return { x: x + width / 2, y: y };
        case 'right': return { x: x + width, y: y + height / 2 };
        case 'bottom': return { x: x + width / 2, y: y + height };
        case 'left': return { x: x, y: y + height / 2 };
    }
};

export const getEdgePath = (
    start: { x: number, y: number },
    end: { x: number, y: number },
    startPos?: HandlePosition,
    endPos?: HandlePosition
) => {
    void startPos;
    void endPos;
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
};

// 计算最近锚点
export const getClosestHandle = (pos: { x: number, y: number }, node: WhiteboardNode) => {
    const handles: HandlePosition[] = ['top', 'right', 'bottom', 'left'];
    let minDist = Infinity;
    let closestResult = {
        handle: 'top' as HandlePosition,
        x: node.x + node.width / 2,
        y: node.y,
        distance: Infinity
    };

    handles.forEach(h => {
        const coords = getHandleCoords(node, h);
        if (coords) {
            const dist = Math.hypot(coords.x - pos.x, coords.y - pos.y);
            if (dist < minDist) {
                minDist = dist;
                closestResult = { handle: h, x: coords.x, y: coords.y, distance: dist };
            }
        }
    });
    return closestResult;
};

// 坐标转换
export const screenToWorld = (screenX: number, screenY: number, viewOffset: { x: number, y: number }, scale: number) => {
    return {
        x: (screenX - viewOffset.x) / scale,
        y: (screenY - viewOffset.y) / scale
    };
};

export const worldToScreen = (worldX: number, worldY: number, viewOffset: { x: number, y: number }, scale: number) => {
    return {
        x: worldX * scale + viewOffset.x,
        y: worldY * scale + viewOffset.y
    };
};

export const getEdgeLabelPoint = (
    start: { x: number; y: number },
    end: { x: number; y: number },
    startPos?: HandlePosition,
    endPos?: HandlePosition
) => {
    void startPos;
    void endPos;
    return {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
    };
};