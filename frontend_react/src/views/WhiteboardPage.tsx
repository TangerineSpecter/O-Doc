import React, {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
    ArrowLeft,
    Circle,
    Diamond,
    FileText,
    Maximize2,
    Minus,
    MousePointer2,
    Plus,
    Redo2,
    Shapes,
    Square,
    StickyNote,
    Trash2,
    Undo2,
    X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import {Article, getArticles} from '../api/article';
import {CodeBlock, CUSTOM_STYLES, MermaidChart} from '../components/Article/MarkdownElements';
import 'katex/dist/katex.min.css';

import {HandlePosition, WhiteboardEdge, WhiteboardNode} from '../types/whiteboard';
import {getClosestHandle, getHandleCoords, screenToWorld} from '../utils/whiteboardUtils';
import {NoteNode} from '../components/Whiteboard/NoteNode';
import {EdgeLayer} from '../components/Whiteboard/EdgeLayer';

// 历史记录最大步数
const MAX_HISTORY = 50;

export default function WhiteboardPage() {
    const navigate = useNavigate();
    const canvasRef = useRef<HTMLDivElement>(null);

    // --- State ---
    const [articles, setArticles] = useState<Article[]>([]);

    // 核心数据
    const [nodes, setNodes] = useState<WhiteboardNode[]>([]);
    const [edges, setEdges] = useState<WhiteboardEdge[]>([]);

    // 历史记录
    const [history, setHistory] = useState<{ nodes: WhiteboardNode[], edges: WhiteboardEdge[] }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // 视图状态
    const [viewOffset, setViewOffset] = useState({x: 0, y: 0});
    const [scale, setScale] = useState(1);

    // 使用 Ref 追踪最新的视图状态，以便在原生事件监听器中访问
    const viewStateRef = useRef({ scale: 1, viewOffset: { x: 0, y: 0 } });
    useEffect(() => {
        viewStateRef.current = { scale, viewOffset };
    }, [scale, viewOffset]);

    // 交互状态
    const [isArticlePickerOpen, setIsArticlePickerOpen] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');

    // 拖拽/连线状态
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
    const [connectionStart, setConnectionStart] = useState<{
        nodeId: string,
        handle: HandlePosition,
        startCoords: { x: number, y: number }
    } | null>(null);

    const [mouseWorldPos, setMouseWorldPos] = useState({x: 0, y: 0});
    const [tempTargetHandle, setTempTargetHandle] = useState<HandlePosition | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({x: 0, y: 0});
    const [dragOffset, setDragOffset] = useState({x: 0, y: 0});
    const [maxZIndex, setMaxZIndex] = useState(1);

    // 加载数据
    useEffect(() => {
        getArticles({}).then(setArticles).catch(console.error);
        saveHistory([], []);
    }, []);

    // --- 历史记录 ---
    const saveHistory = useCallback((currentNodes: WhiteboardNode[], currentEdges: WhiteboardEdge[]) => {
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            newHistory.push({
                nodes: JSON.parse(JSON.stringify(currentNodes)),
                edges: JSON.parse(JSON.stringify(currentEdges))
            });
            if (newHistory.length > MAX_HISTORY) newHistory.shift();
            return newHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        if (historyIndex > 0) {
            const prevIndex = historyIndex - 1;
            const prevState = history[prevIndex];
            setNodes(prevState.nodes);
            setEdges(prevState.edges);
            setHistoryIndex(prevIndex);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
        }
    }, [history, historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextIndex = historyIndex + 1;
            const nextState = history[nextIndex];
            setNodes(nextState.nodes);
            setEdges(nextState.edges);
            setHistoryIndex(nextIndex);
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
        }
    }, [history, historyIndex]);

    const updateNodes = (newNodes: WhiteboardNode[], save = false) => {
        setNodes(newNodes);
        if (save) saveHistory(newNodes, edges);
    };

    // --- 添加节点 ---
    const addNode = (type: any, data: any = {}) => {
        let containerWidth = window.innerWidth;
        let containerHeight = window.innerHeight;

        if (canvasRef.current) {
            containerWidth = canvasRef.current.clientWidth;
            containerHeight = canvasRef.current.clientHeight;
        }

        const centerX = (-viewOffset.x + containerWidth / 2) / scale;
        const centerY = (-viewOffset.y + containerHeight / 2) / scale;

        const baseNode = {
            id: `node-${Date.now()}`,
            x: centerX - 100 + Math.random() * 40,
            y: centerY - 100 + Math.random() * 40,
            zIndex: maxZIndex + 1,
            rotation: 0
        };
        setMaxZIndex(prev => prev + 1);

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

        const nextNodes = [...nodes, newNode];
        updateNodes(nextNodes, true);
    };

    // --- 核心修复：原生 Wheel 事件监听 ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();

            const { scale: currentScale, viewOffset: currentOffset } = viewStateRef.current;

            if (e.ctrlKey || e.metaKey) {
                const zoomSensitivity = 0.005;
                const delta = -e.deltaY * zoomSensitivity;
                const newScale = Math.min(Math.max(currentScale + delta, 0.1), 3);

                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;

                const newX = mouseX - (mouseX - currentOffset.x) * (newScale / currentScale);
                const newY = mouseY - (mouseY - currentOffset.y) * (newScale / currentScale);

                setScale(newScale);
                setViewOffset({x: newX, y: newY});
            } else {
                setViewOffset(prev => ({x: prev.x - e.deltaX, y: prev.y - e.deltaY}));
            }
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', handleWheel);
        };
    }, []);

    // --- 键盘事件 ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) handleRedo();
                else handleUndo();
                e.preventDefault();
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                handleRedo();
                e.preventDefault();
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                const activeTag = document.activeElement?.tagName.toLowerCase();
                if (activeTag === 'textarea' || activeTag === 'input') return;

                if (selectedNodeId) {
                    const newNodes = nodes.filter(n => n.id !== selectedNodeId);
                    const newEdges = edges.filter(edge => edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId);
                    setNodes(newNodes);
                    setEdges(newEdges);
                    setSelectedNodeId(null);
                    saveHistory(newNodes, newEdges);
                }
                if (selectedEdgeId) {
                    const newEdges = edges.filter(edge => edge.id !== selectedEdgeId);
                    setEdges(newEdges);
                    setSelectedEdgeId(null);
                    saveHistory(nodes, newEdges);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedEdgeId, nodes, edges, handleUndo, handleRedo, saveHistory]);


    // --- 鼠标交互 ---
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

    const handleEdgeClick = (id: string) => {
        setSelectedEdgeId(id);
        setSelectedNodeId(null);
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
        setNodes(prev => prev.map(n => n.id === id ? {...n, zIndex: maxZIndex + 1} : n));
        setMaxZIndex(prev => prev + 1);
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
            setNodes(prev => prev.map(n =>
                n.id === draggingNodeId ? {...n, x: worldPos.x - dragOffset.x, y: worldPos.y - dragOffset.y} : n
            ));
        } else if (resizingNodeId) {
            setNodes(prev => prev.map(n => {
                if (n.id === resizingNodeId) {
                    return {...n, width: Math.max(200, worldPos.x - n.x), height: Math.max(150, worldPos.y - n.y)};
                }
                return n;
            }));
        } else if (connectionStart) {
            let tempPos = worldPos;
            let targetHandle: HandlePosition | null = null;
            nodes.forEach(node => {
                if (node.id === connectionStart.nodeId) return;
                if (worldPos.x > node.x - 50 && worldPos.x < node.x + node.width + 50 &&
                    worldPos.y > node.y - 50 && worldPos.y < node.y + node.height + 50) {
                    const closest = getClosestHandle(worldPos, node);
                    if (closest.distance < 30) {
                        tempPos = {x: closest.x, y: closest.y};
                        targetHandle = closest.handle;
                    }
                }
            });
            setMouseWorldPos(tempPos);
            setTempTargetHandle(targetHandle);
        }
    };

    const handleGlobalMouseUp = (_: React.MouseEvent) => {
        let hasChanges = false;
        if (connectionStart) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const worldPos = mouseWorldPos;
                let targetNode = nodes.find(n =>
                    n.id !== connectionStart.nodeId &&
                    worldPos.x >= n.x - 20 && worldPos.x <= n.x + n.width + 20 &&
                    worldPos.y >= n.y - 20 && worldPos.y <= n.y + n.height + 20
                );
                if (targetNode) {
                    const closest = getClosestHandle(worldPos, targetNode);
                    if (closest.distance < 40) {
                        const newEdges = [...edges, {
                            id: `edge-${Date.now()}`,
                            sourceId: connectionStart.nodeId,
                            targetId: targetNode.id,
                            sourceHandle: connectionStart.handle,
                            targetHandle: closest.handle
                        }];
                        setEdges(newEdges);
                        saveHistory(nodes, newEdges);
                    }
                }
            }
        } else if (draggingNodeId || resizingNodeId) {
            hasChanges = true;
        }
        if (hasChanges) saveHistory(nodes, edges);
        setDraggingNodeId(null);
        setResizingNodeId(null);
        setConnectionStart(null);
        setIsPanning(false);
        setTempTargetHandle(null);
    };

    const markdownComponents = React.useMemo(() => ({
        pre: (props: any) => <div className="not-prose">{props.children}</div>,
        code(props: any) {
            const {inline, className, children, ...rest} = props;
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match?.[1] === 'mermaid') return <MermaidChart chart={String(children)}/>;
            if (!inline && match) return <CodeBlock language={match[1]} code={String(children)} {...rest} />;
            return <code
                className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-sm" {...rest}>{children}</code>;
        },
    }), []);

    return (
        <div className="w-full h-[calc(100vh-64px)] bg-[#f0f2f5] flex overflow-hidden relative select-none font-sans">
            <style>{CUSTOM_STYLES}</style>

            {/* 顶部工具栏 (缩放控制) */}
            <div className="absolute top-4 left-4 z-[100] flex gap-3">
                <button onClick={() => navigate('/')}
                        className="p-2 bg-white rounded-xl shadow border border-slate-200 hover:bg-slate-50"><ArrowLeft
                    className="w-5 h-5 text-slate-600"/></button>
                <div className="bg-white rounded-xl shadow border border-slate-200 flex items-center p-1">
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))}
                            className="p-1.5 hover:bg-slate-100 rounded-lg"><Minus className="w-4 h-4"/></button>
                    <span
                        className="w-12 text-center text-xs font-mono text-slate-500">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.1))}
                            className="p-1.5 hover:bg-slate-100 rounded-lg"><Plus className="w-4 h-4"/></button>
                </div>
            </div>

            {/* 撤回/重做 */}
            <div className="absolute left-4 bottom-4 z-[100] flex gap-2">
                <button
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                    className={`p-3 rounded-full shadow-lg border border-slate-200 flex items-center justify-center transition-all ${historyIndex > 0 ? 'bg-white text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    title="撤回 (Ctrl+Z)"
                >
                    <Undo2 className="w-5 h-5"/>
                </button>
                <button
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                    className={`p-3 rounded-full shadow-lg border border-slate-200 flex items-center justify-center transition-all ${historyIndex < history.length - 1 ? 'bg-white text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                    title="重做 (Ctrl+Y)"
                >
                    <Redo2 className="w-5 h-5"/>
                </button>
            </div>

            {/* 左侧创建栏 */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col gap-2 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200">
                <ToolbarBtn icon={<MousePointer2 className="w-5 h-5"/>} label="选择 / 移动"
                            active={activeTool === 'select'} onClick={() => setActiveTool('select')}/>
                <div className="h-px bg-slate-100 w-full my-1"/>
                <ToolbarBtn icon={<FileText className="w-5 h-5"/>} label="插入文章" active={isArticlePickerOpen}
                            onClick={() => setIsArticlePickerOpen(!isArticlePickerOpen)}/>
                <ToolbarBtn icon={<StickyNote className="w-5 h-5"/>} label="便签" onClick={() => addNode('note')}/>

                {/* 图形集合按钮 (Hover 展开) */}
                <div className="relative group">
                    <ToolbarBtn icon={<Shapes className="w-5 h-5"/>} label="图形" active={false} onClick={() => {}} />

                    {/* 侧边展开的图形选择器 */}
                    {/* 修改点：使用 pl-3 替代 ml-3 作为外层容器内边距，确保鼠标移动时不中断 hover 状态 */}
                    <div className="absolute left-full top-0 pl-3 hidden group-hover:flex">
                        <div className="flex flex-col gap-2 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 transition-all animate-in fade-in slide-in-from-left-2">
                            <ToolbarBtn icon={<Square className="w-5 h-5"/>} label="矩形"
                                        onClick={() => addNode('shape', {shapeType: 'rectangle'})}/>
                            <ToolbarBtn icon={<Circle className="w-5 h-5"/>} label="圆形"
                                        onClick={() => addNode('shape', {shapeType: 'circle'})}/>
                            <ToolbarBtn icon={<Diamond className="w-5 h-5"/>} label="菱形"
                                        onClick={() => addNode('shape', {shapeType: 'diamond'})}/>
                        </div>
                    </div>
                </div>
            </div>

            {/* 文章选择器 (UI部分) */}
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

            {/* 画布 */}
            <div
                ref={canvasRef}
                className="flex-1 relative overflow-hidden bg-[#f0f2f5] cursor-default w-full h-full"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleGlobalMouseUp}
            >
                {/* Transform Layer */}
                <div
                    id="canvas-bg"
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform"
                    style={{
                        transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${scale})`,
                        backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                        backgroundSize: '24px 24px',
                    }}
                >
                    {/* 连线层 */}
                    <EdgeLayer
                        edges={edges}
                        nodes={nodes}
                        selectedEdgeId={selectedEdgeId}
                        onSelectEdge={handleEdgeClick}
                        tempConnection={connectionStart ? {
                            start: connectionStart.startCoords,
                            end: mouseWorldPos,
                            startHandle: connectionStart.handle,
                            targetHandle: tempTargetHandle || undefined
                        } : null}
                    />

                    {/* 节点层 */}
                    {nodes.map(node => (
                        <div
                            key={node.id}
                            className="absolute"
                            style={{
                                transform: `translate(${node.x}px, ${node.y}px)`,
                                width: node.width,
                                height: node.height,
                                zIndex: node.zIndex,
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        >
                            {/* --- Note Node --- */}
                            {node.type === 'note' && (
                                <NoteNode
                                    node={node}
                                    selected={selectedNodeId === node.id}
                                    onDelete={(id) => {
                                        const nextNodes = nodes.filter(n => n.id !== id);
                                        const nextEdges = edges.filter(e => e.sourceId !== id && e.targetId !== id);
                                        updateNodes(nextNodes, true);
                                    }}
                                    onDragStart={handleDragStart}
                                />
                            )}

                            {node.type === 'article' && (
                                <div
                                    className={`flex flex-col h-full bg-white rounded-xl shadow-lg border border-slate-200 transition-shadow ${selectedNodeId === node.id ? 'ring-2 ring-orange-400 shadow-2xl' : ''}`}>
                                    <div
                                        className="h-10 bg-slate-50 border-b border-slate-100 flex items-center justify-between px-3 rounded-t-xl cursor-grab active:cursor-grabbing"
                                        onMouseDown={(e) => handleDragStart(e, node.id)}>
                                        <span
                                            className="font-bold text-sm text-slate-700 truncate max-w-[80%]">{node.title}</span>
                                        {selectedNodeId === node.id && <button onClick={() => {
                                            const nextNodes = nodes.filter(n => n.id !== node.id);
                                            const nextEdges = edges.filter(e => e.sourceId !== node.id && e.targetId !== node.id);
                                            setNodes(nextNodes);
                                            setEdges(nextEdges);
                                            saveHistory(nextNodes, nextEdges);
                                        }}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500"/></button>}
                                    </div>
                                    <div
                                        className="flex-1 overflow-y-auto p-4 prose prose-slate max-w-none prose-sm bg-white rounded-b-xl"
                                        onWheel={(e) => e.stopPropagation()}
                                    >
                                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
                                                       rehypePlugins={[rehypeRaw, rehypeKatex]}
                                                       components={markdownComponents as any}>{node.content || ''}</ReactMarkdown>
                                    </div>
                                </div>
                            )}

                            {node.type === 'shape' && (
                                <div
                                    className={`w-full h-full border-4 border-slate-400 bg-transparent cursor-move flex items-center justify-center ${node.shapeType === 'circle' ? 'rounded-full' : node.shapeType === 'diamond' ? 'rotate-45 scale-75' : ''} ${selectedNodeId === node.id ? 'border-orange-400' : ''}`}
                                    onMouseDown={(e) => handleDragStart(e, node.id)}>
                                    {selectedNodeId === node.id && <button className="absolute -top-6" onClick={() => {
                                        const nextNodes = nodes.filter(n => n.id !== node.id);
                                        const nextEdges = edges.filter(e => e.sourceId !== node.id && e.targetId !== node.id);
                                        setNodes(nextNodes);
                                        setEdges(nextEdges);
                                        saveHistory(nextNodes, nextEdges);
                                    }}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500"/></button>}
                                </div>
                            )}

                            {/* 锚点控制 (选中时显示) */}
                            {selectedNodeId === node.id && (
                                <>
                                    <div
                                        className="absolute -bottom-3 -right-3 w-6 h-6 bg-white border shadow rounded-full cursor-nwse-resize flex items-center justify-center z-[60]"
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            setResizingNodeId(node.id);
                                        }}><Maximize2 className="w-3 h-3 rotate-90"/></div>
                                    {(['top', 'right', 'bottom', 'left'] as const).map(pos => (
                                        <div key={pos}
                                             className={`absolute w-3 h-3 bg-white border-2 border-orange-500 rounded-full z-[60] cursor-crosshair hover:scale-150 transition-transform ${pos === 'top' ? 'left-1/2 -top-1.5 -translate-x-1/2' : pos === 'bottom' ? 'left-1/2 -bottom-1.5 -translate-x-1/2' : pos === 'left' ? 'top-1/2 -left-1.5 -translate-y-1/2' : 'top-1/2 -right-1.5 -translate-y-1/2'}`}
                                             onMouseDown={(e) => handleConnectStart(e, node.id, pos)}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ToolbarBtn({icon, label, onClick, active}: any) {
    return (
        <button onClick={onClick}
                className={`p-3 rounded-xl transition-all flex items-center justify-center relative group ${active ? 'bg-orange-100 text-orange-600' : 'text-slate-500 hover:bg-slate-50'}`}
                title={label}>
            {icon}
        </button>
    );
}