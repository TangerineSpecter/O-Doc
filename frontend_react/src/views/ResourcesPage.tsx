import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Search, Filter, Download, Trash2, FileText,
    Image as ImageIcon, Music, Video, Box, FileCode, File,
    HardDrive, Cloud, CheckCircle2, Link2Off, X, Loader2, AlertTriangle,
    BookOpen
} from 'lucide-react';

import { getResources, deleteResource, ResourceItem, GetResourcesParams } from '../api/resources';

interface SelectionBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

const PAGE_SIZE = 24;

interface TypeConfigItem {
    label: string;
    // 修复关键点：指定 ReactElement 接受 className 属性
    icon: React.ReactElement<{ className?: string }>;
    color: string;
}

const TYPE_CONFIG: Record<string, TypeConfigItem> = {
    all: { label: '全部', icon: <HardDrive />, color: 'text-slate-500 bg-slate-100' },
    image: { label: '图片', icon: <ImageIcon />, color: 'text-purple-600 bg-purple-50' },
    doc: { label: '文档', icon: <FileText />, color: 'text-blue-600 bg-blue-50' },
    video: { label: '视频', icon: <Video />, color: 'text-rose-600 bg-rose-50' },
    audio: { label: '音频', icon: <Music />, color: 'text-amber-600 bg-amber-50' },
    code: { label: '代码', icon: <FileCode />, color: 'text-slate-700 bg-slate-200' },
    archive: { label: '压缩包', icon: <Box />, color: 'text-orange-600 bg-orange-50' },
    design: { label: '设计', icon: <File />, color: 'text-pink-600 bg-pink-50' },
};

// 修复关键点：显式声明返回类型
const getFileIcon = (type: string): React.ReactElement<{ className?: string }> =>
    (TYPE_CONFIG[type] || TYPE_CONFIG.design).icon;

const getFileStyle = (type: string) => (TYPE_CONFIG[type] || TYPE_CONFIG.design).color;

export default function ResourcesPage() {
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);

    const [visibleData, setVisibleData] = useState<ResourceItem[]>([]);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [totalCount, setTotalCount] = useState(0); // 添加总数状态

    // --- Delete Modal State ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    // Refs
    const isLoadingRef = useRef(false);
    const filterVersion = useRef(0);
    const gridContainerRef = useRef<HTMLDivElement>(null);

    // --- Drag Selection Refs ---
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const isDraggingRef = useRef(false);
    const initialSelectionRef = useRef<Set<string>>(new Set());
    const [dragSelectionBox, setDragSelectionBox] = useState<SelectionBox | null>(null);

    // ... Data Loading Logic ...
    // 移除本地过滤，改用API获取数据
    useEffect(() => {
        filterVersion.current += 1;
        isLoadingRef.current = true;
        setIsLoading(true);
        setPage(1);
        setHasMore(true);
        setSelectedIds(new Set());
        setVisibleData([]);
        fetchResources(1);
    }, [activeTab, searchQuery, showUnlinkedOnly]);

    // 获取资源列表数据
    const fetchResources = async (pageNum: number) => {
        const currentVersion = filterVersion.current;
        try {
            const params: GetResourcesParams = {
                page: pageNum,
                pageSize: PAGE_SIZE,
                type: activeTab === 'all' ? undefined : activeTab,
                linked: showUnlinkedOnly ? false : undefined,
                searchQuery: searchQuery || undefined
            };

            const response = await getResources(params);

            // --- 核心修复：解构响应对象 ---
            // 后端返回结构: { list: [], total: 100, hasMore: true, ... }
            const { list, total, hasMore: backendHasMore } = response;

            if (filterVersion.current !== currentVersion) return;

            if (pageNum === 1) {
                setVisibleData(list);
                setTotalCount(total);
            } else {
                setVisibleData(prev => [...prev, ...list]);
                setTotalCount(total); // 更新总数以防变化
            }

            setPage(pageNum);
            // 使用后端返回的 hasMore 字段
            setHasMore(backendHasMore);

        } catch (error) {
            console.error('Failed to fetch resources:', error);
            if (filterVersion.current !== currentVersion) return;
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const loadMore = useCallback(() => {
        if (isLoadingRef.current || !hasMore) return;
        isLoadingRef.current = true;
        setIsLoading(true);
        fetchResources(page + 1);
    }, [page, hasMore, activeTab, searchQuery, showUnlinkedOnly]);

    useEffect(() => {
        const handleScroll = () => {
            if (window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 150) {
                loadMore();
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [loadMore]);

    // --- Drag Selection Handlers ---

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDraggingRef.current || !dragStartRef.current) return;

        const currentX = e.clientX;
        const currentY = e.clientY;
        const startX = dragStartRef.current.x;
        const startY = dragStartRef.current.y;

        // 1. Update UI Box
        setDragSelectionBox({
            left: Math.min(startX, currentX),
            top: Math.min(startY, currentY),
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY),
        });

        // 2. Logic: Collision Detection
        const selectRect = {
            left: Math.min(startX, currentX),
            top: Math.min(startY, currentY),
            right: Math.max(startX, currentX),
            bottom: Math.max(startY, currentY),
        };

        const newSelectedIds = new Set(initialSelectionRef.current);
        const cards = document.querySelectorAll('.resource-card');

        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            const id = card.getAttribute('data-id');

            const isIntersecting = !(
                rect.right < selectRect.left ||
                rect.left > selectRect.right ||
                rect.bottom < selectRect.top ||
                rect.top > selectRect.bottom
            );

            if (isIntersecting && id) {
                newSelectedIds.add(id);
            } else if (id && !initialSelectionRef.current.has(id)) {
                newSelectedIds.delete(id);
            }
        });

        setSelectedIds(newSelectedIds);
    }, []);

    const handleMouseUp = useCallback(() => {
        isDraggingRef.current = false;
        dragStartRef.current = null;
        setDragSelectionBox(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
    }, [handleMouseMove]);

    const handleMouseDown = (e: React.MouseEvent) => {
        // 绑定在全宽容器上，忽略卡片内部点击
        const target = e.target as HTMLElement;
        if (e.button !== 0 || target.closest('.resource-card') || target.closest('button')) return;

        isDraggingRef.current = true;
        dragStartRef.current = { x: e.clientX, y: e.clientY };

        const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!isAdditive) {
            setSelectedIds(new Set());
            initialSelectionRef.current = new Set();
        } else {
            initialSelectionRef.current = new Set(selectedIds);
        }

        setDragSelectionBox({
            left: e.clientX, top: e.clientY, width: 0, height: 0
        });

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none';
    };

    // --- End Drag Selection Logic ---

    const toggleSelection = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === visibleData.length && visibleData.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(visibleData.map(r => r.id)));
        }
    };

    const handleBatchDeleteClick = () => {
        if (selectedIds.size > 0) {
            setIsDeleteModalOpen(true);
        }
    };

    const confirmBatchDelete = async () => {
        try {
            for (const id of selectedIds) {
                await deleteResource(id);
            }

            // 重新请求第一页数据
            const currentVersion = filterVersion.current;
            const response = await getResources({
                page: 1,
                pageSize: PAGE_SIZE,
                type: activeTab === 'all' ? undefined : activeTab,
                linked: showUnlinkedOnly ? false : undefined,
                searchQuery: searchQuery || undefined
            });

            // --- 核心修复：同样解构响应对象 ---
            const { list, total, hasMore: backendHasMore } = response;

            if (filterVersion.current === currentVersion) {
                setVisibleData(list);
                setTotalCount(total);
                setHasMore(backendHasMore);
                setPage(1);
            }
            
            setSelectedIds(new Set());
            setIsDeleteModalOpen(false);
        } catch (error) {
            console.error('Failed to delete resources:', error);
            alert('删除失败，请重试');
        }
    };

    const handleBatchDownload = () => {
        alert(`开始批量下载 ${selectedIds.size} 个文件...`);
        setSelectedIds(new Set());
    };

    const handleSingleDownload = (e: React.MouseEvent, file: ResourceItem) => {
        e.stopPropagation();
        alert(`开始下载文件: ${file.name}`);
    };

    return (
        <div
            className="w-full min-h-[calc(100vh-80px)] select-none" // 最外层全宽容器
            onMouseDown={handleMouseDown}
        >

            {/* 1. 拖拽选框 UI */}
            {dragSelectionBox && (
                <div
                    className="fixed border border-blue-500 bg-blue-500/10 z-50 pointer-events-none"
                    style={{
                        left: dragSelectionBox.left,
                        top: dragSelectionBox.top,
                        width: dragSelectionBox.width,
                        height: dragSelectionBox.height,
                    }}
                ></div>
            )}

            {/* Delete Modal (Overlay placed at root) */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsDeleteModalOpen(false)}></div>
                    <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onMouseDown={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">确认删除资源?</h3>
                                    <p className="text-sm text-slate-500">此操作无法撤销。</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                                确定要删除选中的 <span className="font-bold text-slate-900">{selectedIds.size}</span> 个资源文件吗？
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setIsDeleteModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
                                <button onClick={confirmBatchDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm">确认删除</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Actions Bar (Floating) */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-6 duration-300" onMouseDown={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 text-sm font-medium">
                        <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">{selectedIds.size}</span>
                        <span>项已选择</span>
                    </div>
                    <div className="h-4 w-px bg-slate-700"></div>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleSelectAll} className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs transition-colors">{selectedIds.size === visibleData.length ? '取消全选' : '全选当前'}</button>
                        <button onClick={handleBatchDownload} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold transition-colors shadow-sm"><Download className="w-3.5 h-3.5" /> 批量下载</button>
                        <button onClick={handleBatchDeleteClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-bold transition-colors shadow-sm"><Trash2 className="w-3.5 h-3.5" /> 批量删除</button>
                    </div>
                    <button onClick={() => setSelectedIds(new Set())} className="ml-2 p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Main Content (Centered) */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 relative">

                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div onMouseDown={e => e.stopPropagation()}>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            资源库 <span className="text-orange-500">.</span>
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">集中管理您的项目附件、媒体文件与设计素材。</p>
                    </div>

                    <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm select-text" onMouseDown={e => e.stopPropagation()}>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Cloud className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 font-medium">已用空间</span>
                            <div className="flex items-end gap-1">
                                <span className="text-sm font-bold text-slate-800">12.5 GB</span>
                                <span className="text-[10px] text-slate-400 mb-0.5">/ 50 GB</span>
                            </div>
                        </div>
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                            <div className="h-full bg-blue-500 w-1/4 rounded-full"></div>
                        </div>
                        <div className="w-px h-8 bg-slate-100 mx-2 hidden sm:block"></div>
                        <div className="flex-col hidden sm:flex">
                            <span className="text-[10px] text-slate-400 font-medium">资源总数</span>
                            <div className="flex items-end gap-1">
                                <span className="text-sm font-bold text-slate-800">{visibleData.length}</span>
                                <span className="text-[10px] text-slate-400 mb-0.5">个</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 bg-white p-2 rounded-xl shadow-sm border border-slate-100 sticky top-[70px] z-30" onMouseDown={e => e.stopPropagation()}>
                    <div className="flex gap-1 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 scrollbar-hide">
                        {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                            >
                                {React.cloneElement(config.icon, { className: "w-3.5 h-3.5" })}
                                {config.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        <button onClick={() => setShowUnlinkedOnly(!showUnlinkedOnly)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${showUnlinkedOnly ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                            {showUnlinkedOnly ? <Link2Off className="w-3.5 h-3.5" /> : <Filter className="w-3.5 h-3.5" />}
                            {showUnlinkedOnly ? '只看未关联' : '筛选未关联'}
                        </button>
                        <div className="relative flex-1 lg:w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <input type="text" placeholder="搜索资源..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all" />
                        </div>
                    </div>
                </div>

                {/* File Grid */}
                {isLoading && visibleData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-2" />
                        <p className="text-sm">正在加载资源...</p>
                    </div>
                ) : visibleData.length > 0 ? (
                    <div ref={gridContainerRef} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {visibleData.map((file) => {
                            const isSelected = selectedIds.has(file.id);
                            return (
                                <div
                                    key={file.id}
                                    data-id={file.id}
                                    onClick={(e) => toggleSelection(e, file.id)}
                                    className={`resource-card group relative bg-white rounded-xl border transition-all duration-200 cursor-pointer flex flex-col select-none ${isSelected ? 'border-orange-500 ring-1 ring-orange-500 bg-orange-50/5 shadow-md' : 'border-slate-200 hover:border-orange-300 hover:shadow-md'}`}
                                >
                                    <div className="absolute top-2 left-2 z-20" onClick={(e) => e.stopPropagation()}>
                                        <div onClick={(e) => toggleSelection(e, file.id)} className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white/80 border-slate-300 text-transparent hover:border-orange-400 opacity-0 group-hover:opacity-100'}`}>
                                            <CheckCircle2 className="w-3 h-3" />
                                        </div>
                                    </div>
                                    <div className="absolute top-2 right-2 z-20" onClick={(e) => e.stopPropagation()}>
                                        {!file.linked && !isSelected ? (
                                            <div className="px-1.5 py-0.5 bg-red-100/90 text-red-600 text-[10px] font-bold rounded backdrop-blur-sm">未关联</div>
                                        ) : (
                                            <button onClick={(e) => handleSingleDownload(e, file)} className="p-1 rounded-md bg-white/90 text-slate-400 hover:text-blue-600 hover:bg-blue-50 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-all" title="下载文件">
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="aspect-[16/10] bg-slate-50/50 border-b border-slate-100/50 flex items-center justify-center relative">
                                        {/* 修复关键点：使用 cloneElement 动态注入 className */}
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 duration-300 ${getFileStyle(file.type)}`}>
                                            {React.cloneElement(getFileIcon(file.type), { className: "w-5 h-5" })}
                                        </div>
                                    </div>
                                    <div className="p-2.5 flex-1 flex flex-col">
                                        <h3 className="text-xs font-medium text-slate-700 truncate mb-1" title={file.name}>{file.name}</h3>
                                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                                            <span>{file.size}</span>
                                            <span>{file.date}</span>
                                        </div>
                                        {/* 2. 来源笔记样式 */}
                                        {file.sourceArticle && (
                                            <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1.5 text-[10px] text-slate-400 group/source" onClick={(e) => { e.stopPropagation(); console.log('Go to article', file.sourceArticle?.id) }}>
                                                <BookOpen className="w-3 h-3 text-slate-300 group-hover/source:text-orange-400 transition-colors" />
                                                <span className="truncate group-hover/source:text-orange-600 group-hover/source:underline cursor-pointer transition-colors" title={file.sourceArticle.title}>{file.sourceArticle.title}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                        <Filter className="w-8 h-8 text-slate-300 mb-2 opacity-50" />
                        <p className="text-sm">暂无符合条件的资源</p>
                        <button onClick={() => { setActiveTab('all'); setSearchQuery(''); setShowUnlinkedOnly(false); }} className="mt-2 text-xs text-orange-500 hover:underline">重置所有筛选</button>
                    </div>
                )}

                {visibleData.length > 0 && (
                    <div className="flex justify-center mt-6 mb-10 text-center">
                        {isLoading ? <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> 正在加载更多...</div> : !hasMore && <div className="text-slate-300 text-xs">— 到底了，共 {totalCount} 个文件 —</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
