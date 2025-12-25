import { HandlePosition, WhiteboardNode } from '../types/whiteboard';

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

// 生成连线路径 (支持缩放环境)
export const getEdgePath = (start: { x: number, y: number }, end: { x: number, y: number }, startPos: HandlePosition) => {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    let path = `M ${start.x} ${start.y}`;

    if (startPos === 'right' || startPos === 'left') {
        path += ` L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    } else {
        path += ` L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
    }
    return path;
};

// 计算最近锚点
export const getClosestHandle = (pos: { x: number, y: number }, node: WhiteboardNode): HandlePosition => {
    const handles: HandlePosition[] = ['top', 'right', 'bottom', 'left'];
    let minDist = Infinity;
    let closest: HandlePosition = 'top';

    handles.forEach(h => {
        const coords = getHandleCoords(node, h);
        const dist = Math.hypot((coords?.x ?? 0) - pos.x, (coords?.y ?? 0) - pos.y);
        if (dist < minDist) {
            minDist = dist;
            closest = h;
        }
    });
    return closest;
};

// 坐标转换：屏幕坐标 -> 画布世界坐标
export const screenToWorld = (screenX: number, screenY: number, viewOffset: { x: number, y: number }, scale: number) => {
    return {
        x: (screenX - viewOffset.x) / scale,
        y: (screenY - viewOffset.y) / scale
    };
};