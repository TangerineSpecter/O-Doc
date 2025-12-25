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

// --- 核心修改：生成漂亮的贝塞尔曲线 ---
export const getEdgePath = (
    start: { x: number, y: number },
    end: { x: number, y: number },
    startPos: HandlePosition,
    endPos?: HandlePosition // 可选，如果拖拽到一半没有吸附目标，则根据相对位置估算
) => {
    // 1. 确定终点的控制方向
    let targetPos = endPos;
    if (!targetPos) {
        // 如果没有指定终点方向（比如拖拽到空白处），我们假设它总是试图“对面”连接
        // 或者简单点：根据相对位置自动判断
        if (Math.abs(start.x - end.x) > Math.abs(start.y - end.y)) {
            // 水平距离大，假设左右连接
            targetPos = start.x < end.x ? 'left' : 'right';
        } else {
            // 垂直距离大，假设上下连接
            targetPos = start.y < end.y ? 'top' : 'bottom';
        }
    }

    // 2. 计算控制点距离 (Curvature)
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    // 增加曲率系数，让弧线更明显
    const controlDist = Math.max(dist * 0.5, 50);

    // 3. 计算控制点坐标
    const getControlPoint = (pos: {x:number, y:number}, dir: string) => {
        switch (dir) {
            case 'top': return { x: pos.x, y: pos.y - controlDist };
            case 'bottom': return { x: pos.x, y: pos.y + controlDist };
            case 'left': return { x: pos.x - controlDist, y: pos.y };
            case 'right': return { x: pos.x + controlDist, y: pos.y };
            default: return { x: pos.x, y: pos.y };
        }
    };

    const cp1 = getControlPoint(start, startPos);
    const cp2 = getControlPoint(end, targetPos);

    return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
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