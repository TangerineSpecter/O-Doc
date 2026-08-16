import {DEFAULT_NOTE_COLOR} from '../types/whiteboard';
import type {
    EdgeStyle,
    HandlePosition,
    ShapeType,
    ViewTransform,
    WhiteboardDocument,
    WhiteboardEdge,
    WhiteboardNode,
    WhiteboardViewport,
} from '../types/whiteboard';
import {getClosestHandle} from './whiteboardUtils';

export const NODE_DEFAULTS = {
    note: {width: 220, height: 200},
    text: {width: 260, height: 148},
    shape: {width: 176, height: 176},
    article: {width: 480, height: 560},
} as const;

const MIN_SCALE = 0.1;
const MAX_FIT_SCALE = 1.5;

export interface CreateNodeInput {
    id?: string;
    x: number;
    y: number;
    zIndex: number;
    title?: string;
    content?: string;
    color?: string;
    shapeType?: ShapeType;
    articleId?: string;
    centered?: boolean;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const isHandle = (value: unknown): value is HandlePosition =>
    value === 'top' || value === 'right' || value === 'bottom' || value === 'left';

const isShapeType = (value: unknown): value is ShapeType =>
    value === 'rectangle' || value === 'circle' || value === 'diamond';

let whiteboardIdSeq = 0;

export const createWhiteboardId = (prefix: string, now = Date.now(), rand = Math.random) =>
    `${prefix}-${now}-${Math.floor(rand() * 1_000_000)}-${++whiteboardIdSeq}`;

export const getNodeDisplayLabel = (node: WhiteboardNode) => {
    if (node.type === 'article') return node.title?.trim() || '未命名文章';
    if (node.type === 'note') {
        const text = (node.content || '').replace(/\s+/g, ' ').trim();
        return text || '空白便签';
    }
    if (node.type === 'text') {
        return node.label?.trim() || node.title?.trim() || node.content?.trim() || '文本';
    }
    return node.label?.trim() || node.title?.trim() || (
        node.shapeType === 'circle' ? '圆形' : node.shapeType === 'diamond' ? '菱形' : '矩形'
    );
};

export const getNodeLabelValue = (node: WhiteboardNode) =>
    node.label ?? node.title ?? (node.type === 'text' ? node.content : '') ?? '';

const sizeForType = (type: WhiteboardNode['type']) => NODE_DEFAULTS[type] || NODE_DEFAULTS.note;

export const normalizeNode = (raw: Partial<WhiteboardNode> & {id?: string}, index = 0): WhiteboardNode => {
    const type = raw.type === 'article' || raw.type === 'shape' || raw.type === 'text' ? raw.type : 'note';
    const defaults = sizeForType(type);
    return {
        id: raw.id || `node-legacy-${index}`,
        type,
        x: Number.isFinite(raw.x) ? Number(raw.x) : 0,
        y: Number.isFinite(raw.y) ? Number(raw.y) : 0,
        width: Number.isFinite(raw.width) ? Number(raw.width) : defaults.width,
        height: Number.isFinite(raw.height) ? Number(raw.height) : defaults.height,
        zIndex: Number.isFinite(raw.zIndex) ? Number(raw.zIndex) : index + 1,
        title: raw.title,
        content: raw.content,
        articleId: raw.articleId,
        color: raw.color,
        shapeType: isShapeType(raw.shapeType) ? raw.shapeType : type === 'shape' ? 'rectangle' : raw.shapeType,
        rotation: raw.rotation,
        label: raw.label,
    };
};

export const normalizeEdge = (raw: Partial<WhiteboardEdge> & {id?: string; sourceId?: string; targetId?: string}, index = 0): WhiteboardEdge => ({
    id: raw.id || `edge-legacy-${index}`,
    sourceId: raw.sourceId || '',
    targetId: raw.targetId || '',
    sourceHandle: isHandle(raw.sourceHandle) ? raw.sourceHandle : 'right',
    targetHandle: isHandle(raw.targetHandle) ? raw.targetHandle : 'left',
    style: raw.style === 'dashed' ? 'dashed' : raw.style === 'solid' ? 'solid' : raw.style,
    label: raw.label,
});

export const normalizeDocument = (raw: Partial<WhiteboardDocument> & {id: string}): WhiteboardDocument => {
    const now = Date.now();
    return {
        id: raw.id,
        title: raw.title?.trim() || '未命名白板',
        description: raw.description,
        nodes: Array.isArray(raw.nodes) ? raw.nodes.map((node, index) => normalizeNode(node, index)) : [],
        edges: Array.isArray(raw.edges) ? raw.edges.map((edge, index) => normalizeEdge(edge, index)) : [],
        viewOffset: {
            x: Number.isFinite(raw.viewOffset?.x) ? Number(raw.viewOffset?.x) : 80,
            y: Number.isFinite(raw.viewOffset?.y) ? Number(raw.viewOffset?.y) : 80,
        },
        scale: Number.isFinite(raw.scale) ? Number(raw.scale) : 1,
        createdAt: Number.isFinite(raw.createdAt) ? Number(raw.createdAt) : now,
        updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : now,
    };
};

const placeNode = (
    type: WhiteboardNode['type'],
    input: CreateNodeInput,
    extras: Partial<WhiteboardNode>
): WhiteboardNode => {
    const defaults = sizeForType(type);
    const width = defaults.width;
    const height = defaults.height;
    const centered = input.centered !== false;
    return {
        id: input.id || createWhiteboardId('node'),
        type,
        x: centered ? input.x - width / 2 : input.x,
        y: centered ? input.y - height / 2 : input.y,
        width,
        height,
        zIndex: input.zIndex,
        rotation: 0,
        ...extras,
    };
};

export const addNoteNode = (nodes: WhiteboardNode[], input: CreateNodeInput): WhiteboardNode[] => [
    ...nodes,
    placeNode('note', input, {
        content: input.content ?? '',
        color: input.color || DEFAULT_NOTE_COLOR,
    }),
];

export const addTextNode = (nodes: WhiteboardNode[], input: CreateNodeInput): WhiteboardNode[] => [
    ...nodes,
    placeNode('text', input, {
        title: input.title ?? '',
        content: input.content ?? '',
        label: input.title ?? '',
    }),
];

export const addShapeNode = (nodes: WhiteboardNode[], input: CreateNodeInput): WhiteboardNode[] => [
    ...nodes,
    placeNode('shape', input, {
        shapeType: input.shapeType || 'rectangle',
        title: input.title ?? '',
        label: input.title ?? '',
        color: input.color,
    }),
];

export const addArticleNode = (nodes: WhiteboardNode[], input: CreateNodeInput): WhiteboardNode[] => [
    ...nodes,
    placeNode('article', input, {
        title: input.title ?? '未命名文章',
        content: input.content ?? '',
        articleId: input.articleId,
    }),
];

export const inferConnectionHandles = (source: WhiteboardNode, target: WhiteboardNode) => {
    const sourceCenter = {x: source.x + source.width / 2, y: source.y + source.height / 2};
    const targetCenter = {x: target.x + target.width / 2, y: target.y + target.height / 2};
    return {
        sourceHandle: getClosestHandle(targetCenter, source).handle,
        targetHandle: getClosestHandle(sourceCenter, target).handle,
    };
};

export const connectNodes = (
    edges: WhiteboardEdge[],
    nodes: WhiteboardNode[],
    sourceId: string,
    targetId: string,
    options: {
        id?: string;
        sourceHandle?: HandlePosition;
        targetHandle?: HandlePosition;
        style?: EdgeStyle;
        label?: string;
    } = {}
): WhiteboardEdge[] => {
    if (!sourceId || !targetId || sourceId === targetId) return edges;
    const source = nodes.find(node => node.id === sourceId);
    const target = nodes.find(node => node.id === targetId);
    if (!source || !target) return edges;

    const inferred = inferConnectionHandles(source, target);
    const nextEdge: WhiteboardEdge = {
        id: options.id || createWhiteboardId('edge'),
        sourceId,
        targetId,
        sourceHandle: options.sourceHandle || inferred.sourceHandle,
        targetHandle: options.targetHandle || inferred.targetHandle,
        style: options.style,
        label: options.label,
    };

    const isDuplicate = edges.some(edge =>
        edge.sourceId === nextEdge.sourceId &&
        edge.targetId === nextEdge.targetId &&
        edge.sourceHandle === nextEdge.sourceHandle &&
        edge.targetHandle === nextEdge.targetHandle
    );
    if (isDuplicate) return edges;
    return [...edges, nextEdge];
};

export type PointerConnectionInput = {
    sourceId?: string | null;
    sourceHandle?: HandlePosition;
    snappedTarget?: {nodeId: string; handle: HandlePosition} | null;
    clickedTargetId?: string | null;
};

export const resolvePointerConnection = (input: PointerConnectionInput) => {
    const sourceId = input.sourceId;
    if (!sourceId) return null;
    if (input.snappedTarget && input.snappedTarget.nodeId !== sourceId) {
        return {
            sourceId,
            targetId: input.snappedTarget.nodeId,
            sourceHandle: input.sourceHandle,
            targetHandle: input.snappedTarget.handle,
        };
    }
    if (input.clickedTargetId && input.clickedTargetId !== sourceId) {
        return {
            sourceId,
            targetId: input.clickedTargetId,
            sourceHandle: input.sourceHandle,
        };
    }
    return null;
};

export type SnapTarget = {
    nodeId: string;
    handle: HandlePosition;
    coords: {x: number; y: number};
    isSnapped: boolean;
};

export const findSnapTarget = (
    worldPos: {x: number; y: number},
    nodes: WhiteboardNode[],
    sourceId: string,
    revealDistance: number,
    snapDistance: number
): SnapTarget | null => {
    let target: SnapTarget | null = null;
    for (const node of nodes) {
        if (node.id === sourceId) continue;
        const closest = getClosestHandle(worldPos, node);
        const current = target
            ? Math.hypot(target.coords.x - worldPos.x, target.coords.y - worldPos.y)
            : Infinity;
        if (closest.distance <= revealDistance && closest.distance < current) {
            target = {
                nodeId: node.id,
                handle: closest.handle,
                coords: {x: closest.x, y: closest.y},
                isSnapped: closest.distance <= snapDistance,
            };
        }
    }
    return target;
};

export const nodesAfterDrag = (
    nodes: WhiteboardNode[],
    starts: Record<string, {x: number; y: number}>,
    dx: number,
    dy: number
): WhiteboardNode[] =>
    nodes.map(node => {
        const start = starts[node.id];
        return start ? {...node, x: start.x + dx, y: start.y + dy} : node;
    });

export const nodeAfterResize = (
    node: WhiteboardNode,
    worldPos: {x: number; y: number}
): WhiteboardNode => {
    const minW = node.type === 'shape' ? 80 : node.type === 'text' ? 160 : 180;
    const minH = node.type === 'shape' ? 80 : node.type === 'text' ? 88 : 120;
    return {
        ...node,
        width: Math.max(minW, worldPos.x - node.x),
        height: Math.max(minH, worldPos.y - node.y),
    };
};

export const applyPointerConnection = (
    edges: WhiteboardEdge[],
    nodes: WhiteboardNode[],
    input: PointerConnectionInput,
    options: {id?: string} = {}
): WhiteboardEdge[] => {
    const resolved = resolvePointerConnection(input);
    if (!resolved) return edges;
    return connectNodes(edges, nodes, resolved.sourceId, resolved.targetId, {
        id: options.id,
        sourceHandle: resolved.sourceHandle,
        targetHandle: resolved.targetHandle,
    });
};

export const setNoteColor = (nodes: WhiteboardNode[], nodeIds: string[], color: string): WhiteboardNode[] =>
    nodes.map(node =>
        nodeIds.includes(node.id) && node.type === 'note' ? {...node, color} : node
    );

export const setNodeLabel = (nodes: WhiteboardNode[], nodeId: string, label: string): WhiteboardNode[] =>
    nodes.map(node => {
        if (node.id !== nodeId) return node;
        if (node.type === 'text') {
            return {...node, label, title: label, content: label};
        }
        if (node.type === 'shape') {
            return {...node, label, title: label};
        }
        return {...node, label, title: label};
    });

export const setEdgeStyle = (edges: WhiteboardEdge[], edgeId: string, style: EdgeStyle): WhiteboardEdge[] =>
    edges.map(edge => edge.id === edgeId ? {...edge, style} : edge);

export const setEdgeLabel = (edges: WhiteboardEdge[], edgeId: string, label: string): WhiteboardEdge[] =>
    edges.map(edge => edge.id === edgeId ? {...edge, label} : edge);

export const toggleNodeSelection = (current: string[], nodeId: string, additive = false): string[] => {
    if (additive) {
        return current.includes(nodeId) ? current.filter(id => id !== nodeId) : [...current, nodeId];
    }
    return [nodeId];
};

export const nodesInRect = (
    nodes: WhiteboardNode[],
    rect: {x: number; y: number; width: number; height: number}
): string[] => {
    const left = Math.min(rect.x, rect.x + rect.width);
    const top = Math.min(rect.y, rect.y + rect.height);
    const right = left + Math.abs(rect.width);
    const bottom = top + Math.abs(rect.height);
    return nodes
        .filter(node =>
            node.x < right &&
            node.x + node.width > left &&
            node.y < bottom &&
            node.y + node.height > top
        )
        .map(node => node.id);
};

export const moveNodes = (nodes: WhiteboardNode[], nodeIds: string[], dx: number, dy: number): WhiteboardNode[] =>
    nodes.map(node => nodeIds.includes(node.id) ? {...node, x: node.x + dx, y: node.y + dy} : node);

export const duplicateSelection = (
    nodes: WhiteboardNode[],
    edges: WhiteboardEdge[],
    selectedIds: string[],
    options: {offsetX?: number; offsetY?: number; idFactory?: () => string} = {}
): {nodes: WhiteboardNode[]; edges: WhiteboardEdge[]; newIds: string[]} => {
    const offsetX = options.offsetX ?? 40;
    const offsetY = options.offsetY ?? 40;
    const selected = new Set(selectedIds);
    const maxZ = nodes.reduce((max, node) => Math.max(max, node.zIndex || 1), 1);
    const idMap = new Map<string, string>();
    const copies: WhiteboardNode[] = [];

    nodes.forEach(node => {
        if (!selected.has(node.id)) return;
        const nextId = options.idFactory ? options.idFactory() : createWhiteboardId('node');
        idMap.set(node.id, nextId);
        copies.push({
            ...clone(node),
            id: nextId,
            x: node.x + offsetX,
            y: node.y + offsetY,
            zIndex: maxZ + copies.length + 1,
        });
    });

    const copiedEdges = edges
        .filter(edge => selected.has(edge.sourceId) && selected.has(edge.targetId))
        .map(edge => ({
            ...clone(edge),
            id: options.idFactory ? options.idFactory() : createWhiteboardId('edge'),
            sourceId: idMap.get(edge.sourceId) as string,
            targetId: idMap.get(edge.targetId) as string,
        }));

    return {
        nodes: [...nodes, ...copies],
        edges: [...edges, ...copiedEdges],
        newIds: copies.map(node => node.id),
    };
};

export const deleteSelection = (
    nodes: WhiteboardNode[],
    edges: WhiteboardEdge[],
    selectedNodeIds: string[],
    selectedEdgeIds: string[] = []
): {nodes: WhiteboardNode[]; edges: WhiteboardEdge[]} => {
    const removedNodes = new Set(selectedNodeIds);
    const removedEdges = new Set(selectedEdgeIds);
    return {
        nodes: nodes.filter(node => !removedNodes.has(node.id)),
        edges: edges.filter(edge =>
            !removedEdges.has(edge.id) &&
            !removedNodes.has(edge.sourceId) &&
            !removedNodes.has(edge.targetId)
        ),
    };
};

const collectComponent = (
    startId: string,
    neighbors: Map<string, string[]>,
    visited: Set<string>
) => {
    const stack = [startId];
    const component: string[] = [];
    visited.add(startId);
    while (stack.length) {
        const id = stack.pop() as string;
        component.push(id);
        for (const next of neighbors.get(id) || []) {
            if (visited.has(next)) continue;
            visited.add(next);
            stack.push(next);
        }
    }
    return component;
};

export const layoutByConnections = (
    nodes: WhiteboardNode[],
    edges: WhiteboardEdge[],
    options: {gapX?: number; gapY?: number; isolatedCols?: number} = {}
): {nodes: WhiteboardNode[]; edges: WhiteboardEdge[]} => {
    if (nodes.length === 0) return {nodes, edges};

    const gapX = options.gapX ?? 80;
    const gapY = options.gapY ?? 56;
    const isolatedCols = options.isolatedCols ?? 4;
    const nodeById = new Map(nodes.map(node => [node.id, node]));
    const outgoing = new Map<string, string[]>();
    const undirected = new Map<string, string[]>();

    nodes.forEach(node => {
        outgoing.set(node.id, []);
        undirected.set(node.id, []);
    });

    const seenPairs = new Set<string>();
    edges.forEach(edge => {
        if (!nodeById.has(edge.sourceId) || !nodeById.has(edge.targetId) || edge.sourceId === edge.targetId) return;
        const pair = `${edge.sourceId}->${edge.targetId}`;
        if (seenPairs.has(pair)) return;
        seenPairs.add(pair);
        outgoing.get(edge.sourceId)?.push(edge.targetId);
        undirected.get(edge.sourceId)?.push(edge.targetId);
        undirected.get(edge.targetId)?.push(edge.sourceId);
    });

    const visited = new Set<string>();
    const connected: string[][] = [];
    const isolated: WhiteboardNode[] = [];

    nodes.forEach(node => {
        if (visited.has(node.id)) return;
        const component = collectComponent(node.id, undirected, visited);
        const hasEdge = component.some(id => (outgoing.get(id) || []).length > 0 || (undirected.get(id) || []).length > 0);
        if (component.length === 1 && !hasEdge) {
            isolated.push(nodeById.get(component[0]) as WhiteboardNode);
        } else {
            connected.push(component);
        }
    });

    connected.sort((a, b) => {
        const ay = Math.min(...a.map(id => nodeById.get(id)?.y || 0));
        const by = Math.min(...b.map(id => nodeById.get(id)?.y || 0));
        return ay - by;
    });

    const positions = new Map<string, {x: number; y: number}>();
    let blockY = 0;

    connected.forEach(component => {
        const member = new Set(component);
        const indegree = new Map(component.map(id => [id, 0]));
        component.forEach(id => {
            (outgoing.get(id) || []).forEach(target => {
                if (member.has(target)) indegree.set(target, (indegree.get(target) || 0) + 1);
            });
        });

        const placed = new Set<string>();
        const layers: string[][] = [];
        let frontier = component.filter(id => (indegree.get(id) || 0) === 0);
        if (frontier.length === 0) frontier = [component[0]];

        while (frontier.length) {
            frontier.sort((a, b) => {
                const na = nodeById.get(a);
                const nb = nodeById.get(b);
                return (na?.y || 0) - (nb?.y || 0) || (na?.x || 0) - (nb?.x || 0);
            });
            layers.push(frontier);
            frontier.forEach(id => placed.add(id));
            const next: string[] = [];
            const seen = new Set<string>();
            layers[layers.length - 1].forEach(id => {
                (outgoing.get(id) || []).forEach(target => {
                    if (!member.has(target) || placed.has(target)) return;
                    indegree.set(target, (indegree.get(target) || 0) - 1);
                    if ((indegree.get(target) || 0) <= 0 && !seen.has(target)) {
                        seen.add(target);
                        next.push(target);
                    }
                });
            });
            if (next.length === 0) {
                const leftover = component.find(id => !placed.has(id));
                if (leftover) next.push(leftover);
            }
            frontier = next;
        }

        const colWidths = layers.map(layer => Math.max(...layer.map(id => nodeById.get(id)?.width || 0)));
        const colHeights = layers.map(layer =>
            layer.reduce((sum, id) => sum + (nodeById.get(id)?.height || 0), 0) + gapY * Math.max(layer.length - 1, 0)
        );
        const blockHeight = Math.max(...colHeights, 0);
        let x = 0;
        layers.forEach((layer, index) => {
            let y = blockY + (blockHeight - colHeights[index]) / 2;
            layer.forEach(id => {
                positions.set(id, {x, y});
                y += (nodeById.get(id)?.height || 0) + gapY;
            });
            x += colWidths[index] + gapX;
        });
        blockY += blockHeight + gapY * 2;
    });

    if (isolated.length) {
        const startY = positions.size ? blockY : 0;
        let x = 0;
        let y = startY;
        let col = 0;
        let rowHeight = 0;
        [...isolated].sort((a, b) => a.y - b.y || a.x - b.x).forEach(node => {
            positions.set(node.id, {x, y});
            rowHeight = Math.max(rowHeight, node.height);
            col += 1;
            if (col >= isolatedCols) {
                col = 0;
                x = 0;
                y += rowHeight + gapY;
                rowHeight = 0;
            } else {
                x += node.width + gapX;
            }
        });
    }

    const nextNodes = nodes.map(node => {
        const point = positions.get(node.id);
        return point ? {...node, x: point.x, y: point.y} : node;
    });
    const laidOut = new Map(nextNodes.map(node => [node.id, node]));
    const nextEdges = edges.map(edge => {
        const source = laidOut.get(edge.sourceId);
        const target = laidOut.get(edge.targetId);
        if (!source || !target) return edge;
        const handles = inferConnectionHandles(source, target);
        return {...edge, sourceHandle: handles.sourceHandle, targetHandle: handles.targetHandle};
    });

    return {nodes: nextNodes, edges: nextEdges};
};

export const getNodesBounds = (nodes: WhiteboardNode[]) => {
    if (nodes.length === 0) return null;
    const minX = Math.min(...nodes.map(node => node.x));
    const minY = Math.min(...nodes.map(node => node.y));
    const maxX = Math.max(...nodes.map(node => node.x + node.width));
    const maxY = Math.max(...nodes.map(node => node.y + node.height));
    return {minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY};
};

export const fitToContent = (
    nodes: WhiteboardNode[],
    viewport: WhiteboardViewport,
    padding = 80
): ViewTransform => {
    if (nodes.length === 0 || viewport.width <= 0 || viewport.height <= 0) {
        return {viewOffset: {x: 80, y: 80}, scale: 1};
    }

    const bounds = getNodesBounds(nodes);
    if (!bounds) return {viewOffset: {x: 80, y: 80}, scale: 1};

    const availableW = Math.max(viewport.width - padding * 2, 1);
    const availableH = Math.max(viewport.height - padding * 2, 1);
    const scale = Math.min(
        MAX_FIT_SCALE,
        Math.max(MIN_SCALE, Math.min(availableW / Math.max(bounds.width, 1), availableH / Math.max(bounds.height, 1)))
    );
    const viewOffset = {
        x: (viewport.width - bounds.width * scale) / 2 - bounds.minX * scale,
        y: (viewport.height - bounds.height * scale) / 2 - bounds.minY * scale,
    };
    return {viewOffset, scale};
};

export const focusNodeInView = (
    node: WhiteboardNode,
    viewport: WhiteboardViewport,
    scale = 1
): ViewTransform => {
    const safeScale = Math.min(MAX_FIT_SCALE, Math.max(MIN_SCALE, scale));
    return {
        scale: safeScale,
        viewOffset: {
            x: viewport.width / 2 - (node.x + node.width / 2) * safeScale,
            y: viewport.height / 2 - (node.y + node.height / 2) * safeScale,
        },
    };
};

export const nodeFitsInViewport = (
    node: WhiteboardNode,
    transform: ViewTransform,
    viewport: WhiteboardViewport,
    tolerance = 0.5
) => {
    const left = node.x * transform.scale + transform.viewOffset.x;
    const top = node.y * transform.scale + transform.viewOffset.y;
    const right = (node.x + node.width) * transform.scale + transform.viewOffset.x;
    const bottom = (node.y + node.height) * transform.scale + transform.viewOffset.y;
    return (
        left >= -tolerance &&
        top >= -tolerance &&
        right <= viewport.width + tolerance &&
        bottom <= viewport.height + tolerance
    );
};
