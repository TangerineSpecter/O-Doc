import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, CheckCircle2, Maximize2, Save, X} from 'lucide-react';
import {Article, getArticles} from '../api/article';
import {CodeBlock, CUSTOM_STYLES, MermaidChart, SimpleChart} from '../components/Article/MarkdownElements';
import 'katex/dist/katex.min.css';

import {useWhiteboardState} from '../hooks/useWhiteboardState';
import {WhiteboardToolbar} from '../components/Whiteboard/WhiteboardToolbar';
import {WhiteboardSidebar} from '../components/Whiteboard/WhiteboardSidebar';
import {WhiteboardInspector} from '../components/Whiteboard/WhiteboardInspector';
import {WhiteboardOutline} from '../components/Whiteboard/WhiteboardOutline';
import {ArticleNode} from '../components/Whiteboard/ArticleNode';
import {NoteNode} from '../components/Whiteboard/NoteNode';
import {TextNode} from '../components/Whiteboard/TextNode';
import {ShapeNode} from '../components/Whiteboard/ShapeNode';
import {EdgeLayer} from '../components/Whiteboard/EdgeLayer';
import {useWhiteboardDocuments} from '../hooks/useWhiteboardDocuments';
import {useToast} from '../components/common/ToastProvider';
import type {EdgeStyle, HandlePosition, ShapeType, WhiteboardTool} from '../types/whiteboard';
import {getClosestHandle, getEdgeLabelPoint, getEdgePath, getHandleCoords, screenToWorld} from '../utils/whiteboardUtils';
import {getDotBackgroundStyle, getWorldTransform, zoomAtPoint} from '../utils/whiteboardCamera';
import {
    addArticleNode,
    addNoteNode,
    addShapeNode,
    addTextNode,
    applyPointerConnection,
    deleteSelection,
    duplicateSelection,
    findSnapTarget,
    fitToContent,
    focusNodeInView,
    layoutByConnections,
    nodeAfterResize,
    nodesAfterDrag,
    nodesInRect,
    setEdgeLabel,
    setEdgeStyle,
    setNodeLabel,
    setNoteColor,
    toggleNodeSelection,
} from '../utils/whiteboardOps';

const CONNECTION_REVEAL_DISTANCE = 110;
const CONNECTION_SNAP_DISTANCE = 48;
const HANDLE_POSITIONS: HandlePosition[] = ['top', 'right', 'bottom', 'left'];

type DragGesture = {
    ids: string[];
    origin: {x: number; y: number};
    starts: Record<string, {x: number; y: number}>;
};

type ResizeGesture = {
    id: string;
    origin: {x: number; y: number; width: number; height: number};
};

type ConnectGesture = {
    nodeId: string;
    handle: HandlePosition;
    startCoords: {x: number; y: number};
};

type MarqueeGesture = {
    x: number;
    y: number;
    additive: boolean;
};

const isEditingField = (target?: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || element.isContentEditable;
};



export default function WhiteboardPage() {
    const navigate = useNavigate();
    const {boardId} = useParams();
    const canvasRef = useRef<HTMLDivElement>(null);
    const worldRef = useRef<HTMLDivElement>(null);
    const dotsRef = useRef<HTMLDivElement>(null);
    const scaleListenersRef = useRef(new Set<(next: number) => void>());
    const wheelFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const toast = useToast();
    const {getDocument, updateDocument} = useWhiteboardDocuments();

    const {
        nodes, edges, setNodes, updateNodes, updateEdges, updateWhiteboardState, resetWhiteboardState,
        undo, redo, canUndo, canRedo, saveHistory, nextZIndex
    } = useWhiteboardState();

    const [articles, setArticles] = useState<Article[]>([]);
    const [title, setTitle] = useState('未命名白板');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savedSnapshot, setSavedSnapshot] = useState('');
    const [viewOffset, setViewOffset] = useState({x: 0, y: 0});
    const [scale, setScale] = useState(1);

    const [isArticlePickerOpen, setIsArticlePickerOpen] = useState(false);
    const [activeTool, setActiveTool] = useState<WhiteboardTool>('select');
    const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

    const [isConnecting, setIsConnecting] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const isPanningRef = useRef(false);
    const [spaceHeld, setSpaceHeld] = useState(false);
    const panStartRef = useRef({x: 0, y: 0});
    const pendingConnectTargetRef = useRef<string | null>(null);
    const dragRef = useRef<DragGesture | null>(null);
    const resizeRef = useRef<ResizeGesture | null>(null);
    const connectRef = useRef<ConnectGesture | null>(null);
    const connectTargetRef = useRef<ReturnType<typeof findSnapTarget>>(null);
    const marqueeRef = useRef<MarqueeGesture | null>(null);
    const lastPointerRef = useRef({clientX: 0, clientY: 0});
    const moveRafRef = useRef(0);
    const tempPathRef = useRef<SVGPathElement | null>(null);
    const marqueeElRef = useRef<HTMLDivElement | null>(null);
    const nodesRef = useRef(nodes);
    const edgesRef = useRef(edges);
    const snappedHandleRef = useRef<string | null>(null);
    const windowGestureBoundRef = useRef(false);
    const applyPointerFrameRef = useRef<() => void>(() => undefined);

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const viewStateRef = useRef({scale: 1, viewOffset: {x: 0, y: 0}});

    const applyCamera = useCallback((nextScale: number, nextOffset: {x: number; y: number}, syncReact = false) => {
        viewStateRef.current = {scale: nextScale, viewOffset: nextOffset};
        if (worldRef.current) {
            worldRef.current.style.transform = getWorldTransform(nextOffset, nextScale);
        }
        if (dotsRef.current) {
            Object.assign(dotsRef.current.style, getDotBackgroundStyle(nextScale, nextOffset));
        }
        scaleListenersRef.current.forEach(listener => listener(nextScale));
        if (syncReact) {
            setScale(nextScale);
            setViewOffset(nextOffset);
        }
    }, []);

    const subscribeScale = useCallback((listener: (next: number) => void) => {
        scaleListenersRef.current.add(listener);
        return () => {
            scaleListenersRef.current.delete(listener);
        };
    }, []);

    const flushCamera = useCallback(() => {
        const camera = viewStateRef.current;
        setScale(camera.scale);
        setViewOffset(camera.viewOffset);
    }, []);

    useLayoutEffect(() => {
        const camera = viewStateRef.current;
        applyCamera(camera.scale, camera.viewOffset);
    });

    useEffect(() => {
        getArticles({}).then(setArticles).catch(console.error);
    }, []);

    const currentSnapshot = useMemo(() => JSON.stringify({
        title,
        nodes,
        edges,
        viewOffset,
        scale
    }), [title, nodes, edges, viewOffset, scale]);

    const isDirty = savedSnapshot !== '' && currentSnapshot !== savedSnapshot;

    useEffect(() => {
        if (!boardId) {
            navigate('/whiteboard');
            return;
        }

        const document = getDocument(boardId);
        if (!document) {
            toast.warning('白板不存在或已被删除');
            navigate('/whiteboard');
            return;
        }

        setTitle(document.title);
        const nextOffset = document.viewOffset || {x: 80, y: 80};
        const nextScale = document.scale || 1;
        setViewOffset(nextOffset);
        setScale(nextScale);
        applyCamera(nextScale, nextOffset);
        resetWhiteboardState(document.nodes || [], document.edges || []);
        setLastSavedAt(document.updatedAt);
        setSavedSnapshot(JSON.stringify({
            title: document.title,
            nodes: document.nodes || [],
            edges: document.edges || [],
            viewOffset: document.viewOffset || {x: 80, y: 80},
            scale: document.scale || 1
        }));
    }, [boardId]);

    const selectedNodes = useMemo(
        () => nodes.filter(node => selectedNodeIds.includes(node.id)),
        [nodes, selectedNodeIds]
    );
    const selectedEdge = useMemo(
        () => edges.find(edge => edge.id === selectedEdgeId) || null,
        [edges, selectedEdgeId]
    );

    const handleSave = useCallback(() => {
        if (!boardId) return;
        setIsSaving(true);
        const camera = viewStateRef.current;
        updateDocument(boardId, {
            title,
            nodes,
            edges,
            viewOffset: camera.viewOffset,
            scale: camera.scale
        });
        const now = Date.now();
        setLastSavedAt(now);
        setSavedSnapshot(JSON.stringify({
            title,
            nodes,
            edges,
            viewOffset: camera.viewOffset,
            scale: camera.scale
        }));
        setTimeout(() => setIsSaving(false), 250);
        toast.success('白板已保存');
    }, [boardId, edges, nodes, title, toast, updateDocument]);

    const getViewport = useCallback(() => ({
        width: canvasRef.current?.clientWidth || window.innerWidth,
        height: canvasRef.current?.clientHeight || window.innerHeight,
    }), []);

    const worldFromEvent = useCallback((e: {clientX: number; clientY: number}) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return {x: 0, y: 0};
        const camera = viewStateRef.current;
        return screenToWorld(e.clientX - rect.left, e.clientY - rect.top, camera.viewOffset, camera.scale);
    }, []);

    const deleteCurrentSelection = useCallback(() => {
        if (selectedNodeIds.length === 0 && !selectedEdgeId) return;
        const next = deleteSelection(nodes, edges, selectedNodeIds, selectedEdgeId ? [selectedEdgeId] : []);
        updateWhiteboardState(next.nodes, next.edges, true);
        setSelectedNodeIds([]);
        setSelectedEdgeId(null);
        setConnectSourceId(null);
    }, [edges, nodes, selectedEdgeId, selectedNodeIds, updateWhiteboardState]);

    const duplicateCurrentSelection = useCallback(() => {
        if (selectedNodeIds.length === 0) return;
        const result = duplicateSelection(nodes, edges, selectedNodeIds);
        updateWhiteboardState(result.nodes, result.edges, true);
        setSelectedNodeIds(result.newIds);
        setSelectedEdgeId(null);
    }, [edges, nodes, selectedNodeIds, updateWhiteboardState]);

    const updateNoteContent = useCallback((id: string, content: string) => {
        setNodes(prev => prev.map(node => node.id === id ? {...node, content} : node));
    }, [setNodes]);

    const handleFitToContent = useCallback(() => {
        const transform = fitToContent(nodes, getViewport(), 96);
        applyCamera(transform.scale, transform.viewOffset, true);
    }, [applyCamera, getViewport, nodes]);

    const handleAutoLayout = useCallback(() => {
        if (nodes.length === 0) return;
        const laid = layoutByConnections(nodes, edges);
        updateWhiteboardState(laid.nodes, laid.edges, true);
        const transform = fitToContent(laid.nodes, getViewport(), 96);
        applyCamera(transform.scale, transform.viewOffset, true);
    }, [applyCamera, edges, getViewport, nodes, updateWhiteboardState]);

    const jumpToNode = useCallback((nodeId: string) => {
        const node = nodes.find(item => item.id === nodeId);
        if (!node) return;
        const transform = focusNodeInView(node, getViewport(), Math.max(viewStateRef.current.scale, 0.85));
        applyCamera(transform.scale, transform.viewOffset, true);
        setSelectedNodeIds([nodeId]);
        setSelectedEdgeId(null);
    }, [applyCamera, getViewport, nodes]);

    const placeNodeAt = useCallback((tool: WhiteboardTool, world: {x: number; y: number}) => {
        const zIndex = nextZIndex();
        let next = nodes;
        if (tool === 'note') {
            next = addNoteNode(nodes, {x: world.x, y: world.y, zIndex});
        } else if (tool === 'text') {
            next = addTextNode(nodes, {x: world.x, y: world.y, zIndex});
        } else if (tool === 'shape') {
            next = addShapeNode(nodes, {x: world.x, y: world.y, zIndex, shapeType});
        } else {
            return;
        }
        const created = next[next.length - 1];
        updateNodes(next, true);
        setSelectedNodeIds([created.id]);
        setSelectedEdgeId(null);
    }, [nextZIndex, nodes, shapeType, updateNodes]);

    const insertArticle = useCallback((article: Article) => {
        const viewport = getViewport();
        const camera = viewStateRef.current;
        const center = {
            x: (-camera.viewOffset.x + viewport.width / 2) / camera.scale,
            y: (-camera.viewOffset.y + viewport.height / 2) / camera.scale,
        };
        const next = addArticleNode(nodes, {
            x: center.x,
            y: center.y,
            zIndex: nextZIndex(),
            title: article.title,
            content: article.content,
            articleId: article.articleId,
        });
        const created = next[next.length - 1];
        updateNodes(next, true);
        setSelectedNodeIds([created.id]);
        setIsArticlePickerOpen(false);
    }, [getViewport, nextZIndex, nodes, updateNodes]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            const target = e.target as HTMLElement;
            const isInsideScrollable = target.closest('.article-content');
            if (isInsideScrollable && !e.ctrlKey && !e.metaKey) return;

            e.preventDefault();
            const camera = viewStateRef.current;
            if (e.ctrlKey || e.metaKey) {
                const rect = canvas.getBoundingClientRect();
                const zoomed = zoomAtPoint(
                    camera.scale,
                    camera.viewOffset,
                    camera.scale - e.deltaY * 0.005,
                    {x: e.clientX - rect.left, y: e.clientY - rect.top}
                );
                applyCamera(zoomed.scale, zoomed.viewOffset);
            } else {
                applyCamera(camera.scale, {
                    x: camera.viewOffset.x - e.deltaX,
                    y: camera.viewOffset.y - e.deltaY,
                });
            }
            if (wheelFlushTimer.current) clearTimeout(wheelFlushTimer.current);
            wheelFlushTimer.current = setTimeout(flushCamera, 80);
        };

        canvas.addEventListener('wheel', handleWheel, {passive: false});
        return () => {
            canvas.removeEventListener('wheel', handleWheel);
            if (wheelFlushTimer.current) clearTimeout(wheelFlushTimer.current);
        };
    }, [applyCamera, flushCamera]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isEditingField(document.activeElement)) {
                if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y')) return;
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.shiftKey ? redo() : undo();
                e.preventDefault();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                redo();
                e.preventDefault();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                duplicateCurrentSelection();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                handleSave();
                return;
            }
            if (e.code === 'Space') {
                e.preventDefault();
                setSpaceHeld(true);
                return;
            }
            if (e.key === 'Escape') {
                setActiveTool('select');
                setConnectSourceId(null);
                setIsConnecting(false);
                connectRef.current = null;
                showTempPath(false);
                setIsArticlePickerOpen(false);
                return;
            }
            if (e.key === 'v' || e.key === 'V') setActiveTool('select');
            if (e.key === 'h' || e.key === 'H') setActiveTool('pan');
            if (e.key === 'n' || e.key === 'N') setActiveTool('note');
            if (e.key === 't' || e.key === 'T') setActiveTool('text');
            if (e.key === 'g' || e.key === 'G') setActiveTool('shape');
            if (e.key === 'l' || e.key === 'L') setActiveTool('connect');
            if (e.key === 'Delete' || e.key === 'Backspace') {
                deleteCurrentSelection();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') setSpaceHeld(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [deleteCurrentSelection, duplicateCurrentSelection, handleSave, redo, undo]);

    const showTempPath = (visible: boolean) => {
        if (tempPathRef.current) tempPathRef.current.style.display = visible ? 'block' : 'none';
    };

    const paintTempPath = (start: {x: number; y: number}, end: {x: number; y: number}, startHandle: HandlePosition, endHandle?: HandlePosition) => {
        if (!tempPathRef.current) return;
        tempPathRef.current.setAttribute('d', getEdgePath(start, end, startHandle, endHandle));
        showTempPath(true);
    };

    const paintEdgesForNodes = (positions: Map<string, {x: number; y: number; width: number; height: number}>) => {
        const world = worldRef.current;
        if (!world) return;
        const current = nodesRef.current;
        const byId = new Map(current.map(node => [node.id, node]));
        for (const edge of edgesRef.current) {
            const sourceBase = byId.get(edge.sourceId);
            const targetBase = byId.get(edge.targetId);
            if (!sourceBase || !targetBase) continue;
            if (!positions.has(edge.sourceId) && !positions.has(edge.targetId)) continue;
            const source = {...sourceBase, ...positions.get(edge.sourceId)};
            const target = {...targetBase, ...positions.get(edge.targetId)};
            const start = getHandleCoords(source, edge.sourceHandle);
            const end = getHandleCoords(target, edge.targetHandle);
            const d = getEdgePath(start, end, edge.sourceHandle, edge.targetHandle);
            world.querySelector(`[data-edge-line="${edge.id}"]`)?.setAttribute('d', d);
            world.querySelector(`[data-edge-hit="${edge.id}"]`)?.setAttribute('d', d);
            const mid = getEdgeLabelPoint(start, end, edge.sourceHandle, edge.targetHandle);
            const label = world.querySelector(`[data-edge-label="${edge.id}"]`);
            if (label instanceof SVGCircleElement) {
                label.setAttribute('cx', String(mid.x));
                label.setAttribute('cy', String(mid.y));
            } else if (label) {
                label.setAttribute('transform', `translate(${mid.x} ${mid.y})`);
            }
        }
    };

    const highlightSnapHandle = (target: ReturnType<typeof findSnapTarget>) => {
        const nextKey = target?.isSnapped ? `${target.nodeId}-${target.handle}` : null;
        if (snappedHandleRef.current === nextKey) return;
        if (snappedHandleRef.current) {
            const prev = worldRef.current?.querySelector(`[data-handle="${snappedHandleRef.current}"]`);
            prev?.classList.remove('!w-4', '!h-4', 'scale-125');
        }
        if (nextKey) {
            worldRef.current?.querySelector(`[data-handle="${nextKey}"]`)?.classList.add('!w-4', '!h-4', 'scale-125');
        }
        snappedHandleRef.current = nextKey;
    };

    const applyPointerFrame = () => {
        const pointer = lastPointerRef.current;
        const worldPos = worldFromEvent(pointer);

        if (isPanningRef.current) {
            const dx = pointer.clientX - panStartRef.current.x;
            const dy = pointer.clientY - panStartRef.current.y;
            const camera = viewStateRef.current;
            applyCamera(camera.scale, {x: camera.viewOffset.x + dx, y: camera.viewOffset.y + dy});
            panStartRef.current = {x: pointer.clientX, y: pointer.clientY};
            return;
        }

        const marquee = marqueeRef.current;
        if (marquee && marqueeElRef.current) {
            const left = Math.min(marquee.x, worldPos.x);
            const top = Math.min(marquee.y, worldPos.y);
            const width = Math.abs(worldPos.x - marquee.x);
            const height = Math.abs(worldPos.y - marquee.y);
            const box = marqueeElRef.current;
            box.style.display = 'block';
            box.style.left = `${left}px`;
            box.style.top = `${top}px`;
            box.style.width = `${width}px`;
            box.style.height = `${height}px`;
            return;
        }

        const drag = dragRef.current;
        if (drag) {
            const dx = worldPos.x - drag.origin.x;
            const dy = worldPos.y - drag.origin.y;
            const positions = new Map<string, {x: number; y: number; width: number; height: number}>();
            const byId = new Map(nodesRef.current.map(node => [node.id, node]));
            for (const id of drag.ids) {
                const start = drag.starts[id];
                const node = byId.get(id);
                const el = worldRef.current?.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
                if (!start || !node || !el) continue;
                el.style.left = `${start.x + dx}px`;
                el.style.top = `${start.y + dy}px`;
                positions.set(id, {x: start.x + dx, y: start.y + dy, width: node.width, height: node.height});
            }
            paintEdgesForNodes(positions);
            return;
        }

        const resize = resizeRef.current;
        if (resize) {
            const node = nodesRef.current.find(item => item.id === resize.id);
            const el = worldRef.current?.querySelector<HTMLElement>(`[data-node-id="${resize.id}"]`);
            if (!node || !el) return;
            const next = nodeAfterResize({...node, x: resize.origin.x, y: resize.origin.y, width: resize.origin.width, height: resize.origin.height}, worldPos);
            el.style.width = `${next.width}px`;
            el.style.height = `${next.height}px`;
            paintEdgesForNodes(new Map([[node.id, {x: next.x, y: next.y, width: next.width, height: next.height}]]));
            return;
        }

        const connect = connectRef.current;
        if (connect) {
            const target = findSnapTarget(worldPos, nodesRef.current, connect.nodeId, CONNECTION_REVEAL_DISTANCE, CONNECTION_SNAP_DISTANCE);
            connectTargetRef.current = target;
            const end = target?.isSnapped ? target.coords : worldPos;
            paintTempPath(connect.startCoords, end, connect.handle, target?.isSnapped ? target.handle : undefined);
            highlightSnapHandle(target);
        }
    };

    applyPointerFrameRef.current = applyPointerFrame;

    const bindWindowGesture = () => {
        if (windowGestureBoundRef.current) return;
        windowGestureBoundRef.current = true;
        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handleWindowPointerUp);
    };

    const unbindWindowGesture = () => {
        if (!windowGestureBoundRef.current) return;
        windowGestureBoundRef.current = false;
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handleWindowPointerUp);
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
        lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
        if (moveRafRef.current) return;
        moveRafRef.current = requestAnimationFrame(() => {
            moveRafRef.current = 0;
            applyPointerFrameRef.current();
        });
    };

    const handleWindowPointerUp = () => {
        unbindWindowGesture();
        commitPointerGesture();
    };

    const startPan = (e: React.MouseEvent) => {
        isPanningRef.current = true;
        setIsPanning(true);
        panStartRef.current = {x: e.clientX, y: e.clientY};
        lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
        bindWindowGesture();
    };

    const beginConnect = (nodeId: string, handle: HandlePosition, startCoords: {x: number; y: number}) => {
        connectRef.current = {nodeId, handle, startCoords};
        connectTargetRef.current = null;
        pendingConnectTargetRef.current = null;
        setConnectSourceId(nodeId);
        setIsConnecting(true);
        paintTempPath(startCoords, startCoords, handle);
    };

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const onEmpty = target === canvasRef.current || target.id === 'canvas-bg' || target.dataset.role === 'paper';
        if (!onEmpty) return;

        if (spaceHeld || activeTool === 'pan' || e.button === 1) {
            startPan(e);
            return;
        }

        if (activeTool === 'note' || activeTool === 'text' || activeTool === 'shape') {
            placeNodeAt(activeTool, worldFromEvent(e));
            return;
        }

        if (activeTool === 'connect') {
            connectRef.current = null;
            connectTargetRef.current = null;
            pendingConnectTargetRef.current = null;
            setConnectSourceId(null);
            setIsConnecting(false);
            setSelectedEdgeId(null);
            showTempPath(false);
            highlightSnapHandle(null);
            return;
        }

        setSelectedEdgeId(null);
        if (!e.shiftKey) setSelectedNodeIds([]);
        const world = worldFromEvent(e);
        marqueeRef.current = {x: world.x, y: world.y, additive: e.shiftKey};
        lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
        bindWindowGesture();
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (spaceHeld || activeTool === 'pan' || e.button === 1) {
            startPan(e);
            return;
        }

        if (activeTool === 'connect') {
            if (!connectSourceId || connectSourceId === id) {
                const node = nodes.find(item => item.id === id);
                if (!node) return;
                const handle = getClosestHandle(worldFromEvent(e), node);
                beginConnect(id, handle.handle, {x: handle.x, y: handle.y});
                return;
            }
            pendingConnectTargetRef.current = id;
            return;
        }

        setSelectedEdgeId(null);
        setSelectedNodeIds(prev => toggleNodeSelection(prev, id, e.shiftKey));
    };

    const handleDragStart = (e: React.MouseEvent, id: string) => {
        if (activeTool === 'pan' || spaceHeld || activeTool === 'connect') return;
        e.stopPropagation();
        const node = nodes.find(item => item.id === id);
        if (!node) return;
        const ids = selectedNodeIds.includes(id) ? selectedNodeIds : [id];
        if (!selectedNodeIds.includes(id)) setSelectedNodeIds([id]);
        const world = worldFromEvent(e);
        const starts: Record<string, {x: number; y: number}> = {};
        nodes.forEach(item => {
            if (ids.includes(item.id)) starts[item.id] = {x: item.x, y: item.y};
        });
        dragRef.current = {ids, origin: world, starts};
        setSelectedEdgeId(null);
        lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
        bindWindowGesture();
        const raisedZIndex = nextZIndex();
        setNodes(prev => prev.map(item => item.id === id ? {...item, zIndex: raisedZIndex} : item));
        const el = worldRef.current?.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
        if (el) el.style.zIndex = String(raisedZIndex);
    };

    const handleConnectStart = (e: React.MouseEvent, nodeId: string, handle: HandlePosition) => {
        e.stopPropagation();
        const node = nodes.find(item => item.id === nodeId);
        if (!node) return;
        beginConnect(nodeId, handle, getHandleCoords(node, handle));
        lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
        bindWindowGesture();
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
        if (moveRafRef.current) return;
        moveRafRef.current = requestAnimationFrame(() => {
            moveRafRef.current = 0;
            applyPointerFrame();
        });
    };

    const committingRef = useRef(false);

    const commitPointerGesture = () => {
        if (committingRef.current) return;
        committingRef.current = true;
        if (moveRafRef.current) {
            cancelAnimationFrame(moveRafRef.current);
            moveRafRef.current = 0;
        }
        applyPointerFrame();

        const worldPos = worldFromEvent(lastPointerRef.current);
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;

        const marquee = marqueeRef.current;
        if (marquee) {
            const rect = {x: marquee.x, y: marquee.y, width: worldPos.x - marquee.x, height: worldPos.y - marquee.y};
            const ids = nodesInRect(currentNodes, rect);
            if (Math.hypot(rect.width, rect.height) > 6) {
                setSelectedNodeIds(prev => marquee.additive ? Array.from(new Set([...prev, ...ids])) : ids);
            }
            marqueeRef.current = null;
            if (marqueeElRef.current) marqueeElRef.current.style.display = 'none';
        }

        const connect = connectRef.current;
        const target = connectTargetRef.current;
        const nextEdges = applyPointerConnection(currentEdges, currentNodes, {
            sourceId: connect?.nodeId || connectSourceId,
            sourceHandle: connect?.handle,
            snappedTarget: target?.isSnapped ? {nodeId: target.nodeId, handle: target.handle} : null,
            clickedTargetId: pendingConnectTargetRef.current,
        });
        pendingConnectTargetRef.current = null;
        if (nextEdges !== currentEdges) {
            updateEdges(nextEdges, true);
            connectRef.current = null;
            connectTargetRef.current = null;
            setConnectSourceId(null);
            setIsConnecting(false);
            showTempPath(false);
            highlightSnapHandle(null);
        } else if (!(activeTool === 'connect' && connectSourceId)) {
            connectRef.current = null;
            connectTargetRef.current = null;
            setIsConnecting(false);
            setConnectSourceId(null);
            showTempPath(false);
            highlightSnapHandle(null);
        }

        const drag = dragRef.current;
        if (drag) {
            const dx = worldPos.x - drag.origin.x;
            const dy = worldPos.y - drag.origin.y;
            const nextNodes = nodesAfterDrag(currentNodes, drag.starts, dx, dy);
            updateNodes(nextNodes, true);
            dragRef.current = null;
        }

        const resize = resizeRef.current;
        if (resize) {
            const nextNodes = currentNodes.map(node =>
                node.id === resize.id
                    ? nodeAfterResize({...node, x: resize.origin.x, y: resize.origin.y, width: resize.origin.width, height: resize.origin.height}, worldPos)
                    : node
            );
            updateNodes(nextNodes, true);
            resizeRef.current = null;
        }

        isPanningRef.current = false;
        setIsPanning(false);
        flushCamera();
        queueMicrotask(() => {
            committingRef.current = false;
        });
    };

    const handleGlobalMouseUp = () => {
        unbindWindowGesture();
        commitPointerGesture();
    };

    const markdownComponents = useMemo(() => ({
        pre: (props: {children?: React.ReactNode}) => <div className="not-prose">{props.children}</div>,
        code(props: {inline?: boolean; className?: string; children?: React.ReactNode}) {
            const {inline, className, children, ...rest} = props;
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match?.[1] === 'mermaid') return <MermaidChart chart={String(children)}/>;
            if (!inline && match?.[1] === 'chart') return <SimpleChart chart={String(children)}/>;
            if (!inline && match) return <CodeBlock language={match[1]} code={String(children)} {...rest} />;
            return <code
                className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-sm" {...rest}>{children}</code>;
        },
    }), []);

    const canvasCursor = isPanning || activeTool === 'pan' || spaceHeld
        ? (isPanning ? 'cursor-grabbing' : 'cursor-grab')
        : activeTool === 'select'
            ? 'cursor-default'
            : 'cursor-crosshair';

    const changeTool = (tool: WhiteboardTool) => {
        setActiveTool(tool);
        setConnectSourceId(null);
        setIsConnecting(false);
        connectRef.current = null;
        showTempPath(false);
        setIsArticlePickerOpen(false);
    };

    const setScaleFromUi = (next: number | ((current: number) => number)) => {
        const camera = viewStateRef.current;
        const raw = typeof next === 'function' ? next(camera.scale) : next;
        const viewport = getViewport();
        const zoomed = zoomAtPoint(
            camera.scale,
            camera.viewOffset,
            raw,
            {x: viewport.width / 2, y: viewport.height / 2}
        );
        applyCamera(zoomed.scale, zoomed.viewOffset, true);
    };

    return (
        <div className="w-full h-[calc(100vh-64px)] bg-[#f0f2f5] flex overflow-hidden relative select-none font-sans">
            <style>{CUSTOM_STYLES}</style>

            <div className="absolute top-4 left-4 right-4 z-[100] flex items-center justify-between gap-3 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button
                        onClick={() => navigate('/whiteboard')}
                        className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600"/>
                    </button>
                    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border border-slate-200 px-3 py-2 flex items-center gap-3">
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onBlur={() => {
                                if (!title.trim()) setTitle('未命名白板');
                            }}
                            className="w-48 sm:w-72 bg-transparent border-none outline-none text-sm font-bold text-slate-800 placeholder:text-slate-400"
                            placeholder="未命名白板"
                        />
                        <span className={`hidden sm:inline-flex items-center gap-1 text-[11px] ${isDirty ? 'text-orange-600' : 'text-slate-400'}`}>
                            <CheckCircle2 className="w-3.5 h-3.5"/>
                            {isDirty ? '有未保存修改' : lastSavedAt ? `已保存 ${new Date(lastSavedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}` : '已保存'}
                        </span>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95"
                >
                    <Save className="w-4 h-4"/>
                    {isSaving ? '保存中' : '保存'}
                </button>
            </div>

            <WhiteboardToolbar
                scale={scale}
                subscribeScale={subscribeScale}
                setScale={setScaleFromUi}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                onFitToContent={handleFitToContent}
                onAutoLayout={handleAutoLayout}
            />

            <WhiteboardSidebar
                activeTool={activeTool}
                setActiveTool={changeTool}
                shapeType={shapeType}
                setShapeType={setShapeType}
                isArticlePickerOpen={isArticlePickerOpen}
                toggleArticlePicker={() => setIsArticlePickerOpen(!isArticlePickerOpen)}
            />

            <WhiteboardOutline
                nodes={nodes}
                selectedNodeIds={selectedNodeIds}
                onJump={jumpToNode}
            />

            <WhiteboardInspector
                selectedNodes={selectedNodes}
                selectedEdge={selectedEdge}
                onNoteColor={(color) => updateNodes(setNoteColor(nodes, selectedNodeIds, color), true)}
                onNodeLabel={(nodeId, label) => setNodes(setNodeLabel(nodes, nodeId, label))}
                onCommit={() => saveHistory(nodes, edges)}
                onEdgeStyle={(style: EdgeStyle) => {
                    if (!selectedEdgeId) return;
                    updateEdges(setEdgeStyle(edges, selectedEdgeId, style), true);
                }}
                onEdgeLabel={(label) => {
                    if (!selectedEdgeId) return;
                    updateEdges(setEdgeLabel(edges, selectedEdgeId, label), false);
                }}
                onDuplicate={duplicateCurrentSelection}
                onDelete={deleteCurrentSelection}
            />

            <div
                className={`absolute left-20 top-20 bottom-20 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[90] transition-all duration-300 origin-left ${isArticlePickerOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'}`}
            >
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">插入文章</h3>
                    <button onClick={() => setIsArticlePickerOpen(false)}><X className="w-4 h-4 text-slate-400"/></button>
                </div>
                <div className="p-2 overflow-y-auto h-[calc(100%-60px)] space-y-2">
                    {articles.map(article => (
                        <div
                            key={article.articleId}
                            onClick={() => insertArticle(article)}
                            className="p-3 hover:bg-orange-50 rounded-xl cursor-pointer group border border-transparent hover:border-orange-100 transition-all"
                        >
                            <h4 className="font-medium text-slate-700 text-sm group-hover:text-orange-700">{article.title}</h4>
                        </div>
                    ))}
                </div>
            </div>

            <div
                ref={canvasRef}
                className={`flex-1 relative overflow-hidden w-full h-full touch-none ${canvasCursor}`}
                style={{backgroundColor: '#f0f2f5'}}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleGlobalMouseUp}
            >
                <div
                    ref={dotsRef}
                    id="canvas-bg"
                    data-role="paper"
                    className="absolute inset-0 pointer-events-none"
                    style={getDotBackgroundStyle(scale, viewOffset)}
                />
                <div
                    ref={worldRef}
                    data-role="paper"
                    className="absolute top-0 left-0 origin-top-left"
                    style={{
                        transform: getWorldTransform(viewOffset, scale),
                        willChange: 'transform',
                    }}
                >
                    <EdgeLayer
                        edges={edges}
                        nodes={nodes}
                        selectedEdgeId={selectedEdgeId}
                        onSelectEdge={(id) => {
                            if (activeTool === 'pan') return;
                            setSelectedEdgeId(id);
                            setSelectedNodeIds([]);
                        }}
                        tempPathRef={tempPathRef}
                    />

                    {nodes.map(node => {
                        const selected = selectedNodeIds.includes(node.id);
                        const showHandles = selected || connectSourceId === node.id || isConnecting;
                        return (
                            <div
                                key={node.id}
                                data-node-id={node.id}
                                className="absolute"
                                style={{
                                    left: node.x,
                                    top: node.y,
                                    width: node.width,
                                    height: node.height,
                                    zIndex: node.zIndex,
                                }}
                                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                            >
                                {node.type === 'note' && (
                                    <NoteNode
                                        node={node}
                                        selected={selected}
                                        onDelete={() => {
                                            const next = deleteSelection(nodes, edges, [node.id]);
                                            updateWhiteboardState(next.nodes, next.edges, true);
                                            setSelectedNodeIds(prev => prev.filter(id => id !== node.id));
                                        }}
                                        onDragStart={handleDragStart}
                                        onContentChange={updateNoteContent}
                                        onContentCommit={() => saveHistory(nodes, edges)}
                                    />
                                )}

                                {node.type === 'text' && (
                                    <TextNode
                                        node={node}
                                        selected={selected}
                                        onDelete={() => {
                                            const next = deleteSelection(nodes, edges, [node.id]);
                                            updateWhiteboardState(next.nodes, next.edges, true);
                                            setSelectedNodeIds(prev => prev.filter(id => id !== node.id));
                                        }}
                                        onDragStart={handleDragStart}
                                        onLabelChange={(id, label) => setNodes(setNodeLabel(nodes, id, label))}
                                        onLabelCommit={() => saveHistory(nodes, edges)}
                                    />
                                )}

                                {node.type === 'shape' && (
                                    <ShapeNode
                                        node={node}
                                        selected={selected}
                                        onDelete={() => {
                                            const next = deleteSelection(nodes, edges, [node.id]);
                                            updateWhiteboardState(next.nodes, next.edges, true);
                                            setSelectedNodeIds(prev => prev.filter(id => id !== node.id));
                                        }}
                                        onDragStart={handleDragStart}
                                        onLabelChange={(id, label) => setNodes(setNodeLabel(nodes, id, label))}
                                        onLabelCommit={() => saveHistory(nodes, edges)}
                                    />
                                )}

                                {node.type === 'article' && (
                                    <ArticleNode
                                        node={node}
                                        selected={selected}
                                        markdownComponents={markdownComponents}
                                        onDelete={() => {
                                            const next = deleteSelection(nodes, edges, [node.id]);
                                            updateWhiteboardState(next.nodes, next.edges, true);
                                            setSelectedNodeIds(prev => prev.filter(id => id !== node.id));
                                        }}
                                        onDragStart={handleDragStart}
                                    />
                                )}

                                {showHandles && (
                                    <>
                                        {selected && !isConnecting && activeTool === 'select' && (
                                            <div
                                                className="absolute -bottom-3 -right-3 w-6 h-6 bg-white border border-slate-200 shadow rounded-full cursor-nwse-resize flex items-center justify-center z-[60]"
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    resizeRef.current = {
                                                        id: node.id,
                                                        origin: {x: node.x, y: node.y, width: node.width, height: node.height},
                                                    };
                                                    lastPointerRef.current = {clientX: e.clientX, clientY: e.clientY};
                                                    bindWindowGesture();
                                                }}
                                            >
                                                <Maximize2 className="w-3 h-3 rotate-90 text-orange-500"/>
                                            </div>
                                        )}
                                        {HANDLE_POSITIONS.map(pos => {
                                            const canStartConnection = (selected || activeTool === 'connect') && !isConnecting;
                                            const handleClass = 'w-3 h-3 bg-white border-2 border-orange-500';

                                            return (
                                                <div
                                                    key={pos}
                                                    data-handle={`${node.id}-${pos}`}
                                                    className={`absolute rounded-full z-[60] transition-transform ${canStartConnection ? 'cursor-crosshair hover:scale-150' : 'pointer-events-none'} ${handleClass} ${pos === 'top' ? 'left-1/2 -top-1.5 -translate-x-1/2' : pos === 'bottom' ? 'left-1/2 -bottom-1.5 -translate-x-1/2' : pos === 'left' ? 'top-1/2 -left-1.5 -translate-y-1/2' : 'top-1/2 -right-1.5 -translate-y-1/2'}`}
                                                    onMouseDown={(e) => canStartConnection && handleConnectStart(e, node.id, pos)}
                                                />
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        );
                    })}

                    <div
                        ref={marqueeElRef}
                        className="absolute border border-orange-400/80 bg-orange-400/10 rounded-sm pointer-events-none"
                        style={{display: 'none'}}
                    />
                </div>
            </div>
        </div>
    );
}
