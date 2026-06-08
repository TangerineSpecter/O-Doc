import React, {useCallback, useEffect, useRef, useState, useMemo} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, Trash2, Maximize2, X, Save, CheckCircle2} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import {Article, getArticles} from '../api/article';
import {CodeBlock, CUSTOM_STYLES, MermaidChart, SimpleChart} from '../components/Article/MarkdownElements';
import 'katex/dist/katex.min.css';

// 引入新拆分的组件和 Hooks
import {useWhiteboardState} from '../hooks/useWhiteboardState';
import {WhiteboardToolbar} from '../components/Whiteboard/WhiteboardToolbar';
import {WhiteboardSidebar} from '../components/Whiteboard/WhiteboardSidebar';
import {HandlePosition, WhiteboardNode} from '../types/whiteboard';
import {getClosestHandle, getHandleCoords, screenToWorld} from '../utils/whiteboardUtils';
import {NoteNode} from '../components/Whiteboard/NoteNode';
import {EdgeLayer} from '../components/Whiteboard/EdgeLayer';
import {useWhiteboardDocuments} from '../hooks/useWhiteboardDocuments';
import {useToast} from '../components/common/ToastProvider';

const CONNECTION_REVEAL_DISTANCE = 110;
const CONNECTION_SNAP_DISTANCE = 48;
const HANDLE_POSITIONS: HandlePosition[] = ['top', 'right', 'bottom', 'left'];

type ConnectionTarget = {
    nodeId: string;
    handle: HandlePosition;
    coords: { x: number, y: number };
    isSnapped: boolean;
};

export default function WhiteboardPage() {
    const navigate = useNavigate();
    const {boardId} = useParams();
    const canvasRef = useRef<HTMLDivElement>(null);
    const toast = useToast();
    const {getDocument, updateDocument} = useWhiteboardDocuments();

    // --- State: 核心数据 (使用 Hook) ---
    const {
        nodes, edges, setNodes, updateNodes, updateEdges, updateWhiteboardState, resetWhiteboardState,
        undo, redo, canUndo, canRedo, saveHistory, nextZIndex
    } = useWhiteboardState();

    // --- State: 视图与UI ---
    const [articles, setArticles] = useState<Article[]>([]);
    const [title, setTitle] = useState('未命名白板');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savedSnapshot, setSavedSnapshot] = useState('');
    const [viewOffset, setViewOffset] = useState({x: 0, y: 0});
    const [scale, setScale] = useState(1);

    // --- State: 交互 ---
    const [isArticlePickerOpen, setIsArticlePickerOpen] = useState(false);
    const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

    // --- State: 拖拽过程 (临时状态) ---
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
    const [connectionStart, setConnectionStart] = useState<{
        nodeId: string,
        handle: HandlePosition,
        startCoords: { x: number, y: number }
    } | null>(null);
    const [mouseWorldPos, setMouseWorldPos] = useState({x: 0, y: 0});
    const [connectionTarget, setConnectionTarget] = useState<ConnectionTarget | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({x: 0, y: 0});
    const [dragOffset, setDragOffset] = useState({x: 0, y: 0});

    // 用于原生事件获取最新状态
    const viewStateRef = useRef({scale: 1, viewOffset: {x: 0, y: 0}});
    useEffect(() => {
        viewStateRef.current = {scale, viewOffset};
    }, [scale, viewOffset]);

    // 初始化加载
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
        setViewOffset(document.viewOffset || {x: 80, y: 80});
        setScale(document.scale || 1);
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

    const handleSave = useCallback(() => {
        if (!boardId) return;
        setIsSaving(true);
        updateDocument(boardId, {
            title,
            nodes,
            edges,
            viewOffset,
            scale
        });
        const now = Date.now();
        setLastSavedAt(now);
        setSavedSnapshot(currentSnapshot);
        setTimeout(() => setIsSaving(false), 250);
        toast.success('白板已保存');
    }, [boardId, currentSnapshot, edges, nodes, scale, title, toast, updateDocument, viewOffset]);

    const deleteNode = useCallback((id: string) => {
        const newNodes = nodes.filter(n => n.id !== id);
        const newEdges = edges.filter(e => e.sourceId !== id && e.targetId !== id);
        updateWhiteboardState(newNodes, newEdges, true);
        setSelectedNodeId(null);
    }, [edges, nodes, updateWhiteboardState]);

    const updateNoteContent = useCallback((id: string, content: string) => {
        setNodes(prev => prev.map(node => node.id === id ? {...node, content} : node));
    }, [setNodes]);

    // --- 功能: 自动布局 ---
    const handleAutoLayout = useCallback(() => {
        if (nodes.length === 0) return;
        const SPACING = 50;
        const COLS = 4;
        let currentX = 0;
        let currentY = 0;
        let maxHeightInRow = 0;
        const sortedNodes = [...nodes].sort((a, b) => a.y - b.y || a.x - b.x);

        const newNodes = sortedNodes.map((node, index) => {
            const updatedNode = {...node, x: currentX, y: currentY};
            maxHeightInRow = Math.max(maxHeightInRow, node.height);
            currentX += node.width + SPACING;
            if ((index + 1) % COLS === 0) {
                currentX = 0;
                currentY += maxHeightInRow + SPACING;
                maxHeightInRow = 0;
            }
            return updatedNode;
        });
        updateNodes(newNodes, true);
        setViewOffset({x: 50, y: 50});
        setScale(0.8);
    }, [nodes, updateNodes]);

    // --- 功能: 添加节点 ---
    const addNode = (type: string, data: any = {}) => {
        let cw = window.innerWidth;
        let ch = window.innerHeight;
        if (canvasRef.current) {
            cw = canvasRef.current.clientWidth;
            ch = canvasRef.current.clientHeight;
        }
        const centerX = (-viewOffset.x + cw / 2) / scale;
        const centerY = (-viewOffset.y + ch / 2) / scale;

        const baseNode = {
            id: `node-${Date.now()}`,
            x: centerX - 100 + Math.random() * 40,
            y: centerY - 100 + Math.random() * 40,
            zIndex: nextZIndex(),
            rotation: 0
        };

        let newNode: WhiteboardNode;
        if (type === 'article') {
            newNode = {
                ...baseNode,
                type: 'article',
                width: 500,
                height: 600,
                title: data.title,
                content: data.content,
                articleId: data.articleId
            } as WhiteboardNode;
            setIsArticlePickerOpen(false);
        } else if (type === 'note') {
            newNode = {
                ...baseNode,
                type: 'note',
                width: 280,
                height: 320,
                content: '',
                color: '#fef3c7'
            } as WhiteboardNode;
        } else {
            newNode = {
                ...baseNode,
                type: 'shape',
                width: 200,
                height: 200,
                shapeType: data.shapeType || 'rectangle'
            } as WhiteboardNode;
        }
        updateNodes([...nodes, newNode], true);
    };

    // --- 交互: 滚轮缩放 ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            // 1. 检查鼠标是否在文章内容区域内
            const target = e.target as HTMLElement;
            // 使用 closest 查找最近的带 article-content 类名的祖先元素
            const isInsideScrollable = target.closest('.article-content');

            // 2. 核心判断：如果在文章内，且用户不是在尝试缩放（没按 Ctrl），
            //    则直接返回，允许浏览器执行默认的“滚动内容”行为。
            if (isInsideScrollable && !e.ctrlKey && !e.metaKey) {
                return;
            }

            // 3. 否则，阻止默认行为（防止页面整体滚动），并执行画布的缩放或平移
            e.preventDefault();

            const {scale: curScale, viewOffset: curOffset} = viewStateRef.current;
            if (e.ctrlKey || e.metaKey) {
                const delta = -e.deltaY * 0.005;
                const newScale = Math.min(Math.max(curScale + delta, 0.1), 3);
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const newX = mouseX - (mouseX - curOffset.x) * (newScale / curScale);
                const newY = mouseY - (mouseY - curOffset.y) * (newScale / curScale);
                setScale(newScale);
                setViewOffset({x: newX, y: newY});
            } else {
                setViewOffset(prev => ({x: prev.x - e.deltaX, y: prev.y - e.deltaY}));
            }
        };

        // passive: false 是关键，允许我们调用 preventDefault
        canvas.addEventListener('wheel', handleWheel, {passive: false});
        return () => canvas.removeEventListener('wheel', handleWheel);
    }, []);

    // --- 交互: 键盘快捷键 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.shiftKey ? redo() : undo();
                e.preventDefault();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                redo();
                e.preventDefault();
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if (activeTag === 'textarea' || activeTag === 'input') return;
                if (selectedNodeId) {
                    deleteNode(selectedNodeId);
                }
                if (selectedEdgeId) {
                    updateEdges(edges.filter(e => e.id !== selectedEdgeId), true);
                    setSelectedEdgeId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedEdgeId, edges, undo, redo, deleteNode, updateEdges]);

    // --- 交互: 鼠标事件处理 ---
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.target === canvasRef.current || (e.target as HTMLElement).id === 'canvas-bg') {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            if (e.button === 0 || e.button === 1) {
                setIsPanning(true);
                setPanStart({x: e.clientX, y: e.clientY});
            }
        }
    };

    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setSelectedNodeId(id);
        setSelectedEdgeId(null);
    };

    const handleDragStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        setDraggingNodeId(id);
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const worldMouse = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewOffset, scale);
            setDragOffset({x: worldMouse.x - node.x, y: worldMouse.y - node.y});
        }
        setSelectedNodeId(id);
        // 置顶
        setNodes(prev => prev.map(n => n.id === id ? {...n, zIndex: nextZIndex()} : n));
    };

    const handleConnectStart = (e: React.MouseEvent, nodeId: string, handle: HandlePosition) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const startCoords = getHandleCoords(node, handle);
            setConnectionStart({nodeId, handle, startCoords});
            setMouseWorldPos(startCoords);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewOffset, scale);

        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            setViewOffset(prev => ({x: prev.x + dx, y: prev.y + dy}));
            setPanStart({x: e.clientX, y: e.clientY});
        } else if (draggingNodeId) {
            setNodes(prev => prev.map(n => n.id === draggingNodeId ? {
                ...n,
                x: worldPos.x - dragOffset.x,
                y: worldPos.y - dragOffset.y
            } : n));
        } else if (resizingNodeId) {
            setNodes(prev => prev.map(n => n.id === resizingNodeId ? {
                ...n,
                width: Math.max(200, worldPos.x - n.x),
                height: Math.max(150, worldPos.y - n.y)
            } : n));
        } else if (connectionStart) {
            let tempPos = worldPos;
            let target: ConnectionTarget | null = null;
            for (const node of nodes) {
                if (node.id === connectionStart.nodeId) continue;
                const closest = getClosestHandle(worldPos, node);
                const targetDistance = target
                    ? Math.hypot(target.coords.x - worldPos.x, target.coords.y - worldPos.y)
                    : Infinity;

                if (closest.distance <= CONNECTION_REVEAL_DISTANCE && closest.distance < targetDistance) {
                    target = {
                        nodeId: node.id,
                        handle: closest.handle,
                        coords: {x: closest.x, y: closest.y},
                        isSnapped: closest.distance <= CONNECTION_SNAP_DISTANCE
                    };
                }
            }
            if (target?.isSnapped) {
                tempPos = target.coords;
            }
            setMouseWorldPos(tempPos);
            setConnectionTarget(target);
        }
    };

    const handleGlobalMouseUp = (_: React.MouseEvent) => {
        let hasChanges = false;
        if (connectionStart && connectionTarget?.isSnapped) {
            const newEdge = {
                id: `edge-${Date.now()}`,
                sourceId: connectionStart.nodeId,
                targetId: connectionTarget.nodeId,
                sourceHandle: connectionStart.handle,
                targetHandle: connectionTarget.handle
            };
            const isDuplicate = edges.some(edge =>
                edge.sourceId === newEdge.sourceId &&
                edge.targetId === newEdge.targetId &&
                edge.sourceHandle === newEdge.sourceHandle &&
                edge.targetHandle === newEdge.targetHandle
            );
            if (!isDuplicate) {
                updateEdges([...edges, newEdge], true);
            }
        } else if (draggingNodeId || resizingNodeId) {
            hasChanges = true;
        }
        if (hasChanges) saveHistory(nodes, edges);
        setDraggingNodeId(null);
        setResizingNodeId(null);
        setConnectionStart(null);
        setIsPanning(false);
        setConnectionTarget(null);
    };

    const markdownComponents = useMemo(() => ({
        pre: (props: any) => <div className="not-prose">{props.children}</div>,
        code(props: any) {
            const {inline, className, children, ...rest} = props;
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match?.[1] === 'mermaid') return <MermaidChart chart={String(children)}/>;
            if (!inline && match?.[1] === 'chart') return <SimpleChart chart={String(children)}/>;
            if (!inline && match) return <CodeBlock language={match[1]} code={String(children)} {...rest} />;
            return <code
                className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-sm" {...rest}>{children}</code>;
        },
    }), []);

    // --- Render ---
    return (
        <div className="w-full h-[calc(100vh-64px)] bg-[#f0f2f5] flex overflow-hidden relative select-none font-sans">
            <style>{CUSTOM_STYLES}</style>

            {/* 顶部标题栏 */}
            <div className="absolute top-4 left-4 right-4 z-[100] flex items-center justify-between gap-3 pointer-events-none">
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={() => navigate('/whiteboard')}
                            className="p-2 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">
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

            {/* 新的组件：底部工具栏 */}
            <WhiteboardToolbar
                scale={scale}
                setScale={setScale}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                onAutoLayout={handleAutoLayout}
            />

            {/* 新的组件：左侧侧边栏 */}
            <WhiteboardSidebar
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                isArticlePickerOpen={isArticlePickerOpen}
                toggleArticlePicker={() => setIsArticlePickerOpen(!isArticlePickerOpen)}
                onAddNote={() => addNode('note')}
                onAddShape={(type) => addNode('shape', {shapeType: type})}
            />

            {/* 文章选择器浮层 */}
            <div
                className={`absolute left-20 top-20 bottom-20 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[90] transition-all duration-300 origin-left ${isArticlePickerOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'}`}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">选择文章</h3>
                    <button onClick={() => setIsArticlePickerOpen(false)}><X className="w-4 h-4 text-slate-400"/>
                    </button>
                </div>
                <div className="p-2 overflow-y-auto h-[calc(100%-60px)] space-y-2">
                    {articles.map(article => (
                        <div key={article.articleId} onClick={() => addNode('article', article)}
                             className="p-3 hover:bg-orange-50 rounded-xl cursor-pointer group border border-transparent hover:border-orange-100 transition-all">
                            <h4 className="font-medium text-slate-700 text-sm group-hover:text-orange-700">{article.title}</h4>
                        </div>
                    ))}
                </div>
            </div>

            {/* 画布核心区域 */}
            <div
                ref={canvasRef}
                className="flex-1 relative overflow-hidden bg-[#f0f2f5] cursor-default w-full h-full"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleGlobalMouseUp}
            >
                <div
                    id="canvas-bg"
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform"
                    style={{
                        transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${scale})`,
                        backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                        backgroundSize: '24px 24px',
                        backfaceVisibility: 'hidden',
                        WebkitFontSmoothing: 'subpixel-antialiased',
                    }}
                >
                    <EdgeLayer
                        edges={edges}
                        nodes={nodes}
                        selectedEdgeId={selectedEdgeId}
                        onSelectEdge={(id) => {
                            setSelectedEdgeId(id);
                            setSelectedNodeId(null);
                        }}
                        tempConnection={connectionStart ? {
                            start: connectionStart.startCoords,
                            end: mouseWorldPos,
                            startHandle: connectionStart.handle,
                            targetHandle: connectionTarget?.isSnapped ? connectionTarget.handle : undefined
                        } : null}
                    />

                    {nodes.map(node => (
                        <div
                            key={node.id}
                            className="absolute"
                            style={{
                                transform: `translate(${node.x}px, ${node.y}px)`,
                                width: node.width,
                                height: node.height,
                                zIndex: node.zIndex,
                                willChange: 'transform',
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        >
                            {/* --- Note Node --- */}
                            {node.type === 'note' && (
                                <NoteNode
                                    node={node}
                                    selected={selectedNodeId === node.id}
                                    onDelete={deleteNode}
                                    onDragStart={handleDragStart}
                                    onContentChange={updateNoteContent}
                                    onContentCommit={() => saveHistory(nodes, edges)}
                                />
                            )}

                            {/* --- Article Node --- */}
                            {node.type === 'article' && (
                                <div
                                    className={`flex flex-col h-full bg-white rounded-xl shadow-lg border border-slate-200 ${selectedNodeId === node.id ? 'ring-2 ring-orange-400 shadow-2xl' : ''}`}
                                >
                                    <div
                                        className="h-10 bg-slate-50 border-b border-slate-100 flex items-center justify-between px-3 rounded-t-xl cursor-grab active:cursor-grabbing"
                                        onMouseDown={(e) => handleDragStart(e, node.id)}>
                                        <span
                                            className="font-bold text-sm text-slate-700 truncate max-w-[80%]">{node.title}</span>
                                        {selectedNodeId === node.id && <button onClick={() => deleteNode(node.id)}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500"/></button>}
                                    </div>
                                    <div
                                        className="article-content flex-1 overflow-y-auto p-4 prose prose-slate max-w-none prose-sm bg-white rounded-b-xl"
                                        onWheel={(e) => e.stopPropagation()}>
                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
                                                       rehypePlugins={[rehypeRaw, rehypeKatex]}
                                                       components={markdownComponents as any}>{node.content || ''}</ReactMarkdown>
                                    </div>
                                </div>
                            )}

                            {/* --- Shape Node --- */}
                            {node.type === 'shape' && (
                                <div
                                    className={`w-full h-full border-4 border-slate-400 bg-transparent cursor-move flex items-center justify-center ${node.shapeType === 'circle' ? 'rounded-full' : node.shapeType === 'diamond' ? 'rotate-45 scale-75' : ''} ${selectedNodeId === node.id ? 'border-orange-400' : ''}`}
                                    onMouseDown={(e) => handleDragStart(e, node.id)}>
                                    {selectedNodeId === node.id && <button className="absolute -top-6" onClick={() => deleteNode(node.id)}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500"/></button>}
                                </div>
                            )}

                            {/* 锚点控制 */}
                            {(selectedNodeId === node.id || connectionTarget?.nodeId === node.id) && (
                                <>
                                    {selectedNodeId === node.id && !connectionStart && (
                                        <div
                                            className="absolute -bottom-3 -right-3 w-6 h-6 bg-white border shadow rounded-full cursor-nwse-resize flex items-center justify-center z-[60]"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setResizingNodeId(node.id);
                                            }}>
                                            <Maximize2 className="w-3 h-3 rotate-90"/>
                                        </div>
                                    )}
                                    {HANDLE_POSITIONS.map(pos => {
                                        const isTargetHandle = connectionTarget?.nodeId === node.id && connectionTarget.handle === pos;
                                        const canStartConnection = selectedNodeId === node.id && !connectionStart;
                                        const handleClass = isTargetHandle
                                            ? connectionTarget?.isSnapped
                                                ? 'w-4 h-4 bg-orange-500 border-4 border-white shadow-[0_0_0_4px_rgba(249,115,22,0.22)] scale-125'
                                                : 'w-3.5 h-3.5 bg-white border-2 border-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.12)]'
                                            : 'w-3 h-3 bg-white border-2 border-orange-500';

                                        return (
                                            <div key={pos}
                                                 className={`absolute rounded-full z-[60] transition-all ${canStartConnection ? 'cursor-crosshair hover:scale-150' : 'pointer-events-none'} ${handleClass} ${pos === 'top' ? 'left-1/2 -top-1.5 -translate-x-1/2' : pos === 'bottom' ? 'left-1/2 -bottom-1.5 -translate-x-1/2' : pos === 'left' ? 'top-1/2 -left-1.5 -translate-y-1/2' : 'top-1/2 -right-1.5 -translate-y-1/2'}`}
                                                 onMouseDown={(e) => canStartConnection && handleConnectStart(e, node.id, pos)}/>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
