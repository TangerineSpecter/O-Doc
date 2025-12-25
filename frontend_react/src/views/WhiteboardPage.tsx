import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MousePointer2, FileText, StickyNote, Square, Circle, Diamond, GripVertical, Maximize2, Trash2, X, Minus, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { getArticles, Article } from '../api/article';
import { CodeBlock, MermaidChart, CUSTOM_STYLES, ArticleIcons } from '../components/Article/MarkdownElements';
import 'katex/dist/katex.min.css';

// 引入新拆分的组件和工具
import { WhiteboardNode, WhiteboardEdge, HandlePosition } from '../types/whiteboard';
import { getHandleCoords, getClosestHandle, screenToWorld } from '../utils/whiteboardUtils';
import { NoteNode } from '../components/Whiteboard/NoteNode';
import { EdgeLayer } from '../components/Whiteboard/EdgeLayer';

export default function WhiteboardPage() {
    const navigate = useNavigate();
    const canvasRef = useRef<HTMLDivElement>(null);

    // --- State ---
    const [articles, setArticles] = useState<Article[]>([]);
    const [nodes, setNodes] = useState<WhiteboardNode[]>([]);
    const [edges, setEdges] = useState<WhiteboardEdge[]>([]);

    // 视图状态 (支持缩放!)
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [scale, setScale] = useState(1);

    // 交互状态
    const [isArticlePickerOpen, setIsArticlePickerOpen] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null); // 新增：连线选择
    const [activeTool, setActiveTool] = useState<'select' | 'hand'>('select');

    // 拖拽/连线状态
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
    const [connectionStart, setConnectionStart] = useState<{ nodeId: string, handle: HandlePosition, startCoords: { x: number, y: number } } | null>(null);
    const [mouseWorldPos, setMouseWorldPos] = useState({ x: 0, y: 0 });

    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [maxZIndex, setMaxZIndex] = useState(1);

    // 加载数据
    useEffect(() => { getArticles({}).then(setArticles).catch(console.error); }, []);

    // --- 核心逻辑：添加节点 ---
    const addNode = (type: any, data: any = {}) => {
        const centerX = (-viewOffset.x + window.innerWidth / 2) / scale;
        const centerY = (-viewOffset.y + window.innerHeight / 2) / scale;

        const baseNode = {
            id: `node-${Date.now()}`,
            x: centerX - 100 + Math.random() * 40,
            y: centerY - 100 + Math.random() * 40,
            zIndex: maxZIndex + 1,
            rotation: 0 // 默认不旋转
        };
        setMaxZIndex(prev => prev + 1);

        let newNode: WhiteboardNode;

        if (type === 'article') {
            newNode = { ...baseNode, type: 'article', width: 500, height: 600, title: data.title, content: data.content, articleId: data.articleId } as WhiteboardNode;
            setIsArticlePickerOpen(false);
        } else if (type === 'note') {
            // 关键修改：默认颜色改回淡黄色
            newNode = { ...baseNode, type: 'note', width: 280, height: 320, content: '', color: '#fef3c7' } as WhiteboardNode;
        } else {
            newNode = { ...baseNode, type: 'shape', width: 200, height: 200, shapeType: data.shapeType || 'rectangle' } as WhiteboardNode;
        }
        setNodes(prev => [...prev, newNode]);
    };

    // --- 核心逻辑：缩放 (Zoom) ---
    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(scale + delta, 0.1), 3); // 限制缩放范围

            // 鼠标为中心缩放计算
            const rect = canvasRef.current?.getBoundingClientRect();
            if (!rect) return;
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const newX = mouseX - (mouseX - viewOffset.x) * (newScale / scale);
            const newY = mouseY - (mouseY - viewOffset.y) * (newScale / scale);

            setScale(newScale);
            setViewOffset({ x: newX, y: newY });
        } else {
            // 普通滚动 -> 平移
            setViewOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
        }
    };

    // --- 核心逻辑：键盘删除 (Del/Backspace) ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeId) {
                    // 只有当不是在输入框里的时候才删除
                    const activeTag = document.activeElement?.tagName.toLowerCase();
                    if (activeTag !== 'textarea' && activeTag !== 'input') {
                        setNodes(prev => prev.filter(n => n.id !== selectedNodeId));
                        setEdges(prev => prev.filter(edge => edge.sourceId !== selectedNodeId && edge.targetId !== selectedNodeId));
                        setSelectedNodeId(null);
                    }
                }
                if (selectedEdgeId) {
                    setEdges(prev => prev.filter(edge => edge.id !== selectedEdgeId));
                    setSelectedEdgeId(null);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedNodeId, selectedEdgeId]);


    // --- 交互处理 ---

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        // 如果点击的是画布本身，开始平移或取消选择
        if (e.target === canvasRef.current || (e.target as HTMLElement).id === 'canvas-bg') {
            setSelectedNodeId(null);
            setSelectedEdgeId(null);
            if (e.button === 0 || e.button === 1) { // 左键或中键
                setIsPanning(true);
                setPanStart({ x: e.clientX, y: e.clientY });
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
        // 计算点击点相对于节点左上角的偏移 (考虑缩放)
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect) {
            const worldMouse = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewOffset, scale);
            setDragOffset({ x: worldMouse.x - node.x, y: worldMouse.y - node.y });
        }

        setSelectedNodeId(id);
        setNodes(prev => prev.map(n => n.id === id ? { ...n, zIndex: maxZIndex + 1 } : n));
        setMaxZIndex(prev => prev + 1);
    };

    const handleConnectStart = (e: React.MouseEvent, nodeId: string, handle: HandlePosition) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
            const startCoords = getHandleCoords(node, handle);
            setConnectionStart({ nodeId, handle, startCoords });
            setMouseWorldPos(startCoords);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        // 实时计算鼠标在画布的世界坐标
        const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewOffset, scale);

        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setPanStart({ x: e.clientX, y: e.clientY });
        } else if (draggingNodeId) {
            setNodes(prev => prev.map(n =>
                n.id === draggingNodeId ? { ...n, x: worldPos.x - dragOffset.x, y: worldPos.y - dragOffset.y } : n
            ));
        } else if (resizingNodeId) {
            setNodes(prev => prev.map(n => {
                if (n.id === resizingNodeId) {
                    return { ...n, width: Math.max(200, worldPos.x - n.x), height: Math.max(150, worldPos.y - n.y) };
                }
                return n;
            }));
        } else if (connectionStart) {
            setMouseWorldPos(worldPos);
        }
    };

    const handleGlobalMouseUp = (e: React.MouseEvent) => {
        if (connectionStart) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const worldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, viewOffset, scale);
                // 碰撞检测
                const targetNode = nodes.find(n =>
                    worldPos.x >= n.x && worldPos.x <= n.x + n.width &&
                    worldPos.y >= n.y && worldPos.y <= n.y + n.height &&
                    n.id !== connectionStart.nodeId
                );

                if (targetNode) {
                    const targetHandle = getClosestHandle(worldPos, targetNode);
                    setEdges(prev => [...prev, {
                        id: `edge-${Date.now()}`,
                        sourceId: connectionStart.nodeId,
                        targetId: targetNode.id,
                        sourceHandle: connectionStart.handle,
                        targetHandle: targetHandle
                    }]);
                }
            }
        }
        setDraggingNodeId(null);
        setResizingNodeId(null);
        setConnectionStart(null);
        setIsPanning(false);
    };

    // --- Markdown 配置 (复用 Article 页) ---
    const markdownComponents = React.useMemo(() => ({
        pre: (props: any) => <div className="not-prose">{props.children}</div>,
        p: (props: any) => <p className="mb-4 leading-7 text-slate-700">{props.children}</p>,
        code(props: any) {
            const { inline, className, children, ...rest } = props;
            const match = /language-(\w+)/.exec(className || '');
            if (!inline && match?.[1] === 'mermaid') return <MermaidChart chart={String(children)} />;
            if (!inline && match) return <CodeBlock language={match[1]} code={String(children)} {...rest} />;
            return <code className="bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-md font-mono text-sm" {...rest}>{children}</code>;
        },
        blockquote: ({ children }: any) => (
            <blockquote className="not-prose relative my-4 pl-4 border-l-4 border-violet-500 bg-violet-50/50 p-2 text-violet-800 italic rounded-r">{children}</blockquote>
        ),
        // ... 其他 ArticleIcon 相关配置可以按需加入
    }), []);

    return (
        <div className="h-screen w-screen bg-[#f0f2f5] flex overflow-hidden relative select-none font-sans">
            <style>{CUSTOM_STYLES}</style>

            {/* 顶部工具栏 */}
            <div className="absolute top-4 left-4 z-[100] flex gap-3">
                <button onClick={() => navigate('/')} className="p-2 bg-white rounded-xl shadow border border-slate-200 hover:bg-slate-50"><ArrowLeft className="w-5 h-5 text-slate-600" /></button>
                <div className="bg-white rounded-xl shadow border border-slate-200 flex items-center p-1">
                    <button onClick={() => setScale(s => Math.max(0.1, s - 0.1))} className="p-1.5 hover:bg-slate-100 rounded-lg"><Minus className="w-4 h-4" /></button>
                    <span className="w-12 text-center text-xs font-mono text-slate-500">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.1))} className="p-1.5 hover:bg-slate-100 rounded-lg"><Plus className="w-4 h-4" /></button>
                </div>
            </div>

            {/* 左侧创建栏 */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[100] flex flex-col gap-2 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200">
                <ToolbarBtn icon={<MousePointer2 className="w-5 h-5" />} label="选择 / 移动" active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
                <div className="h-px bg-slate-100 w-full my-1" />
                <ToolbarBtn icon={<FileText className="w-5 h-5" />} label="插入文章" active={isArticlePickerOpen} onClick={() => setIsArticlePickerOpen(!isArticlePickerOpen)} />
                <ToolbarBtn icon={<StickyNote className="w-5 h-5" />} label="便签 (截图风)" onClick={() => addNode('note')} />
                <ToolbarBtn icon={<Square className="w-5 h-5" />} label="矩形" onClick={() => addNode('shape', { shapeType: 'rectangle' })} />
                <ToolbarBtn icon={<Circle className="w-5 h-5" />} label="圆形" onClick={() => addNode('shape', { shapeType: 'circle' })} />
                <ToolbarBtn icon={<Diamond className="w-5 h-5" />} label="菱形" onClick={() => addNode('shape', { shapeType: 'diamond' })} />
            </div>

            {/* 文章选择器 (保持原样，略) */}
            {/* ... ArticlePicker UI ... */}
            <div className={`absolute left-20 top-20 bottom-20 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[90] transition-all duration-300 origin-left ${isArticlePickerOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'}`}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">选择文章</h3>
                    <button onClick={() => setIsArticlePickerOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="p-2 overflow-y-auto h-[calc(100%-60px)] space-y-2">
                    {articles.map(article => (
                        <div key={article.articleId} onClick={() => addNode('article', article)} className="p-3 hover:bg-orange-50 rounded-xl cursor-pointer group border border-transparent hover:border-orange-100 transition-all">
                            <h4 className="font-medium text-slate-700 text-sm group-hover:text-orange-700">{article.title}</h4>
                        </div>
                    ))}
                </div>
            </div>

            {/* 主画布 Canvas */}
            <div
                ref={canvasRef}
                className="flex-1 relative overflow-hidden bg-[#f0f2f5] cursor-default"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleGlobalMouseUp}
                onWheel={handleWheel}
            >
                {/* Transform Layer: 应用平移和缩放 */}
                <div
                    id="canvas-bg"
                    className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform"
                    style={{
                        transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${scale})`,
                        backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                        backgroundSize: '24px 24px', // 背景网格不随缩放改变大小，产生视差感，或者可以改为 backgroundSize: `${24*scale}px`
                    }}
                >
                    {/* 连线层 */}
                    <EdgeLayer
                        edges={edges}
                        nodes={nodes}
                        selectedEdgeId={selectedEdgeId}
                        onSelectEdge={setSelectedEdgeId}
                        tempConnection={connectionStart ? { start: connectionStart.startCoords, end: mouseWorldPos, startHandle: connectionStart.handle } : null}
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
                            {/* --- Note Node (新风格) --- */}
                            {node.type === 'note' && (
                                <NoteNode
                                    node={node}
                                    selected={selectedNodeId === node.id}
                                    onDelete={(id) => { setNodes(prev => prev.filter(n => n.id !== id)); }}
                                    onDragStart={handleDragStart}
                                />
                            )}

                            {/* --- Article Node (保持窗口风格) --- */}
                            {node.type === 'article' && (
                                <div className={`flex flex-col h-full bg-white rounded-xl shadow-lg border border-slate-200 transition-shadow ${selectedNodeId === node.id ? 'ring-2 ring-orange-400 shadow-2xl' : ''}`}>
                                    <div className="h-10 bg-slate-50 border-b border-slate-100 flex items-center justify-between px-3 rounded-t-xl cursor-grab active:cursor-grabbing" onMouseDown={(e) => handleDragStart(e, node.id)}>
                                        <span className="font-bold text-sm text-slate-700 truncate max-w-[80%]">{node.title}</span>
                                        {selectedNodeId === node.id && <button onClick={() => setNodes(prev => prev.filter(n => n.id !== node.id))}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" /></button>}
                                    </div>
                                    <div 
                                        className="flex-1 overflow-y-auto p-4 prose prose-slate max-w-none prose-sm bg-white rounded-b-xl"
                                        onWheel={(e) => e.stopPropagation()} // 关键：在这里阻止冒泡！
                                     >
                                         <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} components={markdownComponents as any}>{node.content || ''}</ReactMarkdown>
                                     </div>
                                </div>
                            )}

                            {/* --- Shape Node --- */}
                            {node.type === 'shape' && (
                                <div className={`w-full h-full border-4 border-slate-400 bg-transparent cursor-move flex items-center justify-center ${node.shapeType === 'circle' ? 'rounded-full' : node.shapeType === 'diamond' ? 'rotate-45 scale-75' : ''} ${selectedNodeId === node.id ? 'border-orange-400' : ''}`} onMouseDown={(e) => handleDragStart(e, node.id)}>
                                    {selectedNodeId === node.id && <button className="absolute -top-6" onClick={() => setNodes(prev => prev.filter(n => n.id !== node.id))}><Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" /></button>}
                                </div>
                            )}

                            {/* 控制手柄: 缩放 + 连线锚点 (只在选中时显示) */}
                            {selectedNodeId === node.id && (
                                <>
                                    <div className="absolute -bottom-3 -right-3 w-6 h-6 bg-white border shadow rounded-full cursor-nwse-resize flex items-center justify-center z-[60]" onMouseDown={(e) => { e.stopPropagation(); setResizingNodeId(node.id); }}><Maximize2 className="w-3 h-3 rotate-90" /></div>
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

function ToolbarBtn({ icon, label, onClick, active }: any) {
    return (
        <button onClick={onClick} className={`p-3 rounded-xl transition-all flex items-center justify-center relative group ${active ? 'bg-orange-100 text-orange-600' : 'text-slate-500 hover:bg-slate-50'}`} title={label}>
            {icon}
        </button>
    );
}