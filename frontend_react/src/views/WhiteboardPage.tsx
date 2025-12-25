import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    ArrowLeft, MousePointer2, FileText, StickyNote, Square, 
    Trash2, Maximize2, X, Circle, Diamond, GripVertical
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { getArticles, Article } from '../api/article';
// 引入与 Article 页一致的组件和样式
import { CodeBlock, MermaidChart, CUSTOM_STYLES } from '../components/Article/MarkdownElements';
import 'katex/dist/katex.min.css';

// --- 类型定义 ---
type NodeType = 'article' | 'note' | 'shape';
type ShapeType = 'rectangle' | 'circle' | 'diamond';
type HandlePosition = 'top' | 'right' | 'bottom' | 'left';

interface WhiteboardNode {
    id: string;
    type: NodeType;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    // 数据字段
    title?: string;
    content?: string;
    articleId?: string;
    color?: string;
    shapeType?: ShapeType;
}

interface WhiteboardEdge {
    id: string;
    sourceId: string;
    targetId: string;
    sourceHandle: HandlePosition;
    targetHandle: HandlePosition;
}

// --- 几何计算与连线算法 ---

// 获取节点某个锚点的世界坐标
const getHandleCoords = (node: WhiteboardNode, handle: HandlePosition) => {
    const { x, y, width, height } = node;
    switch (handle) {
        case 'top': return { x: x + width / 2, y: y };
        case 'right': return { x: x + width, y: y + height / 2 };
        case 'bottom': return { x: x + width / 2, y: y + height };
        case 'left': return { x: x, y: y + height / 2 };
    }
};

// 生成正交折线路径 (Orthogonal Connector)
const getEdgePath = (start: {x: number, y: number}, end: {x: number, y: number}, startPos: HandlePosition) => {
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    let path = `M ${start.x} ${start.y}`;

    // 简单折线策略：根据出发方向决定第一段走向
    if (startPos === 'right' || startPos === 'left') {
        // 如果是左右出发，先水平走到中间，再垂直
        path += ` L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
    } else { 
        // 如果是上下出发，先垂直走到中间，再水平
        path += ` L ${start.x} ${midY} L ${end.x} ${midY} L ${end.x} ${end.y}`;
    }
    return path;
};

// 自动计算目标节点最近的锚点 (吸附效果)
const getClosestHandle = (pos: {x: number, y: number}, node: WhiteboardNode): HandlePosition => {
    const handles: HandlePosition[] = ['top', 'right', 'bottom', 'left'];
    let minDest = Infinity;
    let closest: HandlePosition = 'top';
    
    handles.forEach(h => {
        const coords = getHandleCoords(node, h);
        const dist = Math.hypot(coords.x - pos.x, coords.y - pos.y);
        if (dist < minDest) {
            minDest = dist;
            closest = h;
        }
    });
    return closest;
};

export default function WhiteboardPage() {
    const navigate = useNavigate();
    const canvasRef = useRef<HTMLDivElement>(null);

    // --- 状态管理 ---
    const [articles, setArticles] = useState<Article[]>([]);
    const [nodes, setNodes] = useState<WhiteboardNode[]>([]);
    const [edges, setEdges] = useState<WhiteboardEdge[]>([]);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 }); // 画布平移
    
    // UI 开关
    const [isArticlePickerOpen, setIsArticlePickerOpen] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<'select' | 'connect'>('select');

    // 交互过程状态
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [resizingNodeId, setResizingNodeId] = useState<string | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    
    // 连线过程状态
    const [connectionStart, setConnectionStart] = useState<{ nodeId: string, handle: HandlePosition } | null>(null);
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // 鼠标的世界坐标
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [maxZIndex, setMaxZIndex] = useState(1);

    // 加载文章数据
    useEffect(() => {
        getArticles({}).then(setArticles).catch(console.error);
    }, []);

    // --- 添加节点逻辑 ---
    const addNode = (type: NodeType, data: any = {}) => {
        // 在视野中心生成
        const centerX = -viewOffset.x + window.innerWidth / 2 - 150;
        const centerY = -viewOffset.y + window.innerHeight / 2 - 200;

        const baseNode = {
            id: `node-${Date.now()}`,
            x: centerX + Math.random() * 40,
            y: centerY + Math.random() * 40,
            zIndex: maxZIndex + 1,
        };
        setMaxZIndex(prev => prev + 1);

        if (type === 'article') {
            setNodes(prev => [...prev, {
                ...baseNode, type: 'article',
                width: 500, height: 600, // 稍微大一点，适应文章阅读
                title: data.title, content: data.content, articleId: data.articleId
            }]);
            setIsArticlePickerOpen(false);
        } else if (type === 'note') {
            setNodes(prev => [...prev, {
                ...baseNode, type: 'note',
                width: 260, height: 260,
                content: '', color: '#fef3c7'
            }]);
        } else if (type === 'shape') {
            setNodes(prev => [...prev, {
                ...baseNode, type: 'shape',
                width: 200, height: 200,
                shapeType: data.shapeType || 'rectangle'
            }]);
        }
    };

    // --- 交互事件 ---

    // 1. 画布平移
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.target === canvasRef.current || e.target === e.currentTarget) {
            setSelectedNodeId(null); // 点击空白取消选中
            setIsPanning(true);
            setPanStart({ x: e.clientX, y: e.clientY });
        }
    };

    // 2. 节点选中
    const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // 阻止画布平移
        setSelectedNodeId(id);
    };

    // 3. 节点拖拽 (仅限 Header 触发)
    const handleDragStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        setDraggingNodeId(id);
        setDragOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
        // 选中并提层级
        setSelectedNodeId(id);
        setNodes(prev => prev.map(n => n.id === id ? { ...n, zIndex: maxZIndex + 1 } : n));
        setMaxZIndex(prev => prev + 1);
    };

    // 4. 调整大小
    const handleResizeStart = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setResizingNodeId(id);
    };

    // 5. 开始连线 (从锚点触发)
    const handleConnectStart = (e: React.MouseEvent, nodeId: string, handle: HandlePosition) => {
        e.stopPropagation();
        setConnectionStart({ nodeId, handle });
        const node = nodes.find(n => n.id === nodeId);
        if(node) {
             setMousePos(getHandleCoords(node, handle)); // 初始坐标
        }
    };

    // 6. 结束连线 (鼠标松开)
    const handleGlobalMouseUp = (e: React.MouseEvent) => {
        if (connectionStart) {
            // 查找鼠标下方的节点（简化逻辑：遍历节点判断是否在范围内）
            // 注意：这里需要考虑 viewOffset 转换鼠标坐标到世界坐标
            const rect = canvasRef.current?.getBoundingClientRect();
            if(rect) {
                const worldX = e.clientX - rect.left - viewOffset.x;
                const worldY = e.clientY - rect.top - viewOffset.y;
                
                // 简单的碰撞检测
                const targetNode = nodes.find(n => 
                    worldX >= n.x && worldX <= n.x + n.width &&
                    worldY >= n.y && worldY <= n.y + n.height &&
                    n.id !== connectionStart.nodeId
                );

                if (targetNode) {
                    const targetHandle = getClosestHandle({x: worldX, y: worldY}, targetNode);
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
        
        // 重置所有交互状态
        setDraggingNodeId(null);
        setResizingNodeId(null);
        setConnectionStart(null);
        setIsPanning(false);
    };

    // 全局移动逻辑
    const handleMouseMove = (e: React.MouseEvent) => {
        // 计算世界坐标
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const worldX = e.clientX - rect.left - viewOffset.x;
        const worldY = e.clientY - rect.top - viewOffset.y;

        if (isPanning) {
            const dx = e.clientX - panStart.x;
            const dy = e.clientY - panStart.y;
            setViewOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setPanStart({ x: e.clientX, y: e.clientY });
        } else if (draggingNodeId) {
            setNodes(prev => prev.map(n => 
                n.id === draggingNodeId 
                    ? { ...n, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y } 
                    : n
            ));
        } else if (resizingNodeId) {
            setNodes(prev => prev.map(n => {
                if (n.id === resizingNodeId) {
                    return { 
                        ...n, 
                        width: Math.max(200, worldX - n.x), 
                        height: Math.max(150, worldY - n.y) 
                    };
                }
                return n;
            }));
        } else if (connectionStart) {
            setMousePos({ x: worldX, y: worldY });
        }
    };

    const deleteNode = (id: string) => {
        setNodes(prev => prev.filter(n => n.id !== id));
        setEdges(prev => prev.filter(e => e.sourceId !== id && e.targetId !== id));
        setSelectedNodeId(null);
    };

    // --- Markdown 配置 (复用 Article 页配置) ---
    const markdownComponents = useMemo(() => ({
        code: CodeBlock,
        // 拦截 div 渲染 Mermaid
        div: ({node, className, ...props}: any) => {
             if (className?.includes('mermaid')) {
                 return <MermaidChart chart={props.children} />;
             }
             return <div className={className} {...props} />;
        }
    }), []);

    return (
        <div 
            className="h-screen w-screen bg-slate-50 flex overflow-hidden relative select-none font-sans"
            onMouseMove={handleMouseMove}
            onMouseUp={handleGlobalMouseUp}
        >
            <style>{CUSTOM_STYLES}</style>

            {/* 顶部导航 */}
            <div className="absolute top-4 left-4 z-50 flex items-center gap-3 pointer-events-auto">
                <button onClick={() => navigate('/')} className="p-2 bg-white rounded-xl shadow border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="px-4 py-2 bg-white rounded-xl shadow border border-slate-200 font-bold text-slate-700 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
                    灵感白板
                </div>
            </div>

            {/* 左侧工具栏 */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-2 p-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 pointer-events-auto">
                <ToolbarBtn icon={<MousePointer2 className="w-5 h-5" />} label="选择 / 移动" active={activeTool === 'select'} onClick={() => setActiveTool('select')} />
                <div className="h-px bg-slate-100 w-full my-1" />
                <ToolbarBtn 
                    icon={<FileText className="w-5 h-5" />} 
                    label="插入文章" 
                    active={isArticlePickerOpen} 
                    onClick={() => setIsArticlePickerOpen(!isArticlePickerOpen)} 
                />
                <ToolbarBtn icon={<StickyNote className="w-5 h-5" />} label="便签" onClick={() => addNode('note')} />
                <ToolbarBtn icon={<Square className="w-5 h-5" />} label="矩形" onClick={() => addNode('shape', { shapeType: 'rectangle' })} />
                <ToolbarBtn icon={<Circle className="w-5 h-5" />} label="圆形" onClick={() => addNode('shape', { shapeType: 'circle' })} />
                <ToolbarBtn icon={<Diamond className="w-5 h-5" />} label="菱形" onClick={() => addNode('shape', { shapeType: 'diamond' })} />
            </div>

            {/* 文章选择器弹出层 */}
            <div className={`absolute left-20 top-20 bottom-20 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[60] transition-all duration-300 origin-left pointer-events-auto ${isArticlePickerOpen ? 'scale-100 opacity-100' : 'scale-90 opacity-0 pointer-events-none'}`}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700">选择文章</h3>
                    <button onClick={() => setIsArticlePickerOpen(false)}><X className="w-4 h-4 text-slate-400" /></button>
                </div>
                <div className="p-2 overflow-y-auto h-[calc(100%-60px)] space-y-2">
                    {articles.map(article => (
                        <div key={article.articleId} onClick={() => addNode('article', article)} className="p-3 hover:bg-orange-50 rounded-xl cursor-pointer group border border-transparent hover:border-orange-100 transition-all">
                            <h4 className="font-medium text-slate-700 text-sm group-hover:text-orange-700">{article.title}</h4>
                            <p className="text-xs text-slate-400 mt-1 line-clamp-2">{article.content?.slice(0, 50)}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* 核心画布 */}
            <div 
                ref={canvasRef}
                className="flex-1 relative overflow-hidden bg-[#f8fafc] cursor-default"
                onMouseDown={handleCanvasMouseDown}
                style={{
                    backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
                    backgroundSize: '24px 24px',
                    backgroundPosition: `${viewOffset.x}px ${viewOffset.y}px`
                }}
            >
                {/* 统一变换容器 */}
                <div 
                    className="absolute top-0 left-0 w-full h-full pointer-events-none origin-top-left"
                    style={{ transform: `translate(${viewOffset.x}px, ${viewOffset.y}px)` }}
                >
                    {/* 1. 连线层 (SVG) */}
                    <svg className="overflow-visible absolute top-0 left-0 w-full h-full z-0">
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                            </marker>
                        </defs>
                        {edges.map(edge => {
                            const sNode = nodes.find(n => n.id === edge.sourceId);
                            const tNode = nodes.find(n => n.id === edge.targetId);
                            if (!sNode || !tNode) return null;
                            
                            const start = getHandleCoords(sNode, edge.sourceHandle);
                            const end = getHandleCoords(tNode, edge.targetHandle);
                            const d = getEdgePath(start, end, edge.sourceHandle);
                            
                            return (
                                <g key={edge.id} className="group pointer-events-auto cursor-pointer">
                                    <path d={d} fill="none" stroke="#cbd5e1" strokeWidth="2" markerEnd="url(#arrowhead)" className="group-hover:stroke-orange-400 transition-colors" />
                                    <path d={d} fill="none" stroke="transparent" strokeWidth="15" /> {/* 扩大点击区域 */}
                                    <circle cx={(start.x + end.x)/2} cy={(start.y + end.y)/2} r="0" className="group-hover:r-3 fill-red-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); setEdges(prev => prev.filter(ed => ed.id !== edge.id)); }} />
                                </g>
                            )
                        })}
                        {/* 拖拽中的虚线 */}
                        {connectionStart && (
                            <path 
                                d={(() => {
                                    const sNode = nodes.find(n => n.id === connectionStart.nodeId);
                                    if(!sNode) return '';
                                    return getEdgePath(getHandleCoords(sNode, connectionStart.handle), mousePos, connectionStart.handle);
                                })()}
                                fill="none" stroke="#f97316" strokeWidth="2" strokeDasharray="5,5" 
                            />
                        )}
                    </svg>

                    {/* 2. 节点层 */}
                    {nodes.map(node => (
                        <div
                            key={node.id}
                            className={`absolute pointer-events-auto flex flex-col transition-shadow duration-200
                                ${node.type === 'shape' ? '' : 'rounded-xl shadow-sm bg-white'}
                                ${selectedNodeId === node.id ? 'ring-2 ring-orange-400 shadow-xl z-30' : 'hover:shadow-md border border-slate-200/0'}
                            `}
                            style={{
                                transform: `translate(${node.x}px, ${node.y}px)`,
                                width: node.width,
                                height: node.height,
                                zIndex: node.zIndex,
                                ...(node.type === 'shape' ? {} : { border: '1px solid #e2e8f0' })
                            }}
                            onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        >
                            {/* --- Article Node --- */}
                            {node.type === 'article' && (
                                <>
                                    {/* 标题栏: 唯一的拖拽区 */}
                                    <div 
                                        className="h-11 flex-shrink-0 border-b border-slate-100 flex items-center justify-between px-3 bg-slate-50/80 backdrop-blur-sm rounded-t-xl cursor-grab active:cursor-grabbing select-none"
                                        onMouseDown={(e) => handleDragStart(e, node.id)}
                                    >
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg"><FileText className="w-3.5 h-3.5" /></div>
                                            <span className="font-bold text-sm text-slate-700 truncate">{node.title}</span>
                                        </div>
                                        {selectedNodeId === node.id && (
                                            <button className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-md transition-colors" onClick={() => deleteNode(node.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* 内容区: 自由滚动，不拦截鼠标 */}
                                    <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent bg-white rounded-b-xl cursor-text selection:bg-orange-100">
                                        {/* 使用标准的 prose 类，移除 -sm 以匹配详情页大小 */}
                                        <div className="prose prose-slate max-w-none prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl prose-p:text-slate-600 prose-pre:bg-slate-900 prose-pre:text-slate-50">
                                            <ReactMarkdown 
                                                remarkPlugins={[remarkGfm, remarkMath]} 
                                                rehypePlugins={[rehypeRaw, rehypeKatex]}
                                                components={markdownComponents}
                                            >
                                                {node.content || ''}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* --- Note Node --- */}
                            {node.type === 'note' && (
                                <>
                                    <div 
                                        className="h-8 w-full absolute top-0 left-0 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                                        onMouseDown={(e) => handleDragStart(e, node.id)} 
                                    >
                                        <GripVertical className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="w-full h-full p-5 pt-8 relative flex flex-col" style={{ backgroundColor: node.color }}>
                                        <textarea 
                                            className="w-full h-full bg-transparent resize-none outline-none text-slate-800 font-handwriting text-lg leading-relaxed placeholder:text-slate-500/30"
                                            defaultValue={node.content}
                                            placeholder="写点什么..."
                                            onMouseDown={(e) => e.stopPropagation()} 
                                        />
                                        {selectedNodeId === node.id && (
                                            <button className="absolute top-2 right-2 p-1 text-slate-500/50 hover:text-red-600 z-20" onClick={() => deleteNode(node.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* --- Shape Node --- */}
                            {node.type === 'shape' && (
                                <div 
                                    className="w-full h-full relative cursor-move flex items-center justify-center group"
                                    onMouseDown={(e) => handleDragStart(e, node.id)}
                                >
                                    <div className={`w-full h-full border-4 border-slate-300 bg-transparent flex items-center justify-center transition-colors group-hover:border-slate-400 ${
                                        node.shapeType === 'circle' ? 'rounded-full' : 
                                        node.shapeType === 'diamond' ? 'rotate-45 scale-75' : 'rounded-none'
                                    }`}>
                                    </div>
                                    {selectedNodeId === node.id && (
                                        <button className="absolute -top-8 bg-white shadow rounded-full p-1.5 text-slate-400 hover:text-red-500" onClick={() => deleteNode(node.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* --- 控制手柄 (仅选中显示) --- */}
                            {selectedNodeId === node.id && (
                                <>
                                    {/* 调整大小手柄 */}
                                    <div 
                                        className="absolute -bottom-3 -right-3 w-6 h-6 bg-white border border-slate-200 shadow-md rounded-full flex items-center justify-center cursor-nwse-resize z-50 hover:scale-110 transition-transform"
                                        onMouseDown={(e) => handleResizeStart(e, node.id)}
                                    >
                                        <Maximize2 className="w-3 h-3 text-slate-500 rotate-90" />
                                    </div>

                                    {/* 4个方向的连线锚点 */}
                                    {(['top', 'right', 'bottom', 'left'] as HandlePosition[]).map(pos => (
                                        <div
                                            key={pos}
                                            className={`absolute w-3.5 h-3.5 bg-white border-2 border-orange-500 rounded-full z-50 hover:scale-125 hover:bg-orange-50 transition-all cursor-crosshair
                                                ${pos === 'top' ? '-top-1.5 left-1/2 -translate-x-1/2' : 
                                                  pos === 'bottom' ? '-bottom-1.5 left-1/2 -translate-x-1/2' :
                                                  pos === 'left' ? '-left-1.5 top-1/2 -translate-y-1/2' :
                                                  '-right-1.5 top-1/2 -translate-y-1/2'}
                                            `}
                                            onMouseDown={(e) => handleConnectStart(e, node.id, pos)}
                                            title="拖拽连线"
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

// 简单的工具栏按钮
function ToolbarBtn({ icon, label, onClick, active }: any) {
    return (
        <div className="relative group">
            <button 
                onClick={onClick}
                className={`p-3 rounded-xl transition-all duration-200 flex items-center justify-center
                    ${active ? 'bg-orange-100 text-orange-600 shadow-inner ring-1 ring-orange-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}
                `}
            >
                {icon}
            </button>
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-2 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-[70] shadow-xl">
                {label}
                <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-slate-800"></div>
            </div>
        </div>
    );
}