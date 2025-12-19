import React, {useState, useEffect, useCallback, useRef} from 'react';
import {useToast} from '../components/common/ToastProvider';
import {useNavigate} from 'react-router-dom';

import {
    Search, Filter, Download, Trash2, FileText,
    Image as ImageIcon, Music, Video, Box, FileCode, File,
    HardDrive, Cloud, CheckCircle2, Link2Off, X, Loader2, AlertTriangle,
    BookOpen
} from 'lucide-react';

import {getResources, deleteResource, downloadResource, ResourceItem, GetResourcesParams, FormattedSize} from '../api/resources';
import {formatFileSize} from '@/utils/format';

interface SelectionBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

const PAGE_SIZE = 24;

interface TypeConfigItem {
    label: string;
    icon: React.ReactElement<{ className?: string }>;
    color: string;
}

const TYPE_CONFIG: Record<string, TypeConfigItem> = {
    all: {label: '全部', icon: <HardDrive/>, color: 'text-slate-500 bg-slate-100'},
    image: {label: '图片', icon: <ImageIcon/>, color: 'text-purple-600 bg-purple-50'},
    document: {label: '文档', icon: <FileText/>, color: 'text-blue-600 bg-blue-50'},
    video: {label: '视频', icon: <Video/>, color: 'text-rose-600 bg-rose-50'},
    audio: {label: '音频', icon: <Music/>, color: 'text-amber-600 bg-amber-50'},
    code: {label: '代码', icon: <FileCode/>, color: 'text-slate-700 bg-slate-200'},
    archive: {label: '压缩包', icon: <Box/>, color: 'text-orange-600 bg-orange-50'},
    design: {label: '设计', icon: <File/>, color: 'text-pink-600 bg-pink-50'},
};

const getFileIcon = (type: string): React.ReactElement<{ className?: string }> =>
    (TYPE_CONFIG[type] || TYPE_CONFIG.design).icon;

const getFileStyle = (type: string) => (TYPE_CONFIG[type] || TYPE_CONFIG.design).color;

export default function ResourcesPage() {
    const toast = useToast();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); // 防抖后的搜索词
    const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);

    const [visibleData, setVisibleData] = useState<ResourceItem[]>([]);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [totalCount, setTotalCount] = useState(0);
    const [formattedTotalSize, setFormattedTotalSize] = useState<FormattedSize>({size: 0, unit: 'B'});

    // --- Delete Modal State ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null); // 单个删除的ID

    // Refs
    const isLoadingRef = useRef(false);
    const filterVersion = useRef(0);
    const gridContainerRef = useRef<HTMLDivElement>(null);

    // --- Drag Selection Refs ---
    const dragStartRef = useRef<{ x: number, y: number } | null>(null);
    const isDraggingRef = useRef(false);
    const initialSelectionRef = useRef<Set<string>>(new Set());
    const [dragSelectionBox, setDragSelectionBox] = useState<SelectionBox | null>(null);

    // --- 1. 防抖逻辑 ---
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 500); // 500ms 防抖
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // 加载数据：监听 debouncedSearchQuery 而不是 searchQuery
    useEffect(() => {
        filterVersion.current += 1;
        isLoadingRef.current = true;
        setIsLoading(true);
        setPage(1);
        setHasMore(true);
        setSelectedIds(new Set());
        setVisibleData([]);
        fetchResources(1);
    }, [activeTab, debouncedSearchQuery, showUnlinkedOnly]);

    // 获取资源列表数据
    const fetchResources = async (pageNum: number) => {
        const currentVersion = filterVersion.current;
        try {
            const params: GetResourcesParams = {
                page: pageNum,
                pageSize: PAGE_SIZE,
                type: activeTab === 'all' ? undefined : activeTab,
                linked: showUnlinkedOnly ? false : undefined,
                searchQuery: debouncedSearchQuery || undefined
            };

            const response = await getResources(params);
            const {list, total, hasMore: backendHasMore, formattedTotalSize: backendFormattedTotalSize} = response;

            if (filterVersion.current !== currentVersion) return;

            if (pageNum === 1) {
                setVisibleData(list);
                setTotalCount(total);
                setFormattedTotalSize(backendFormattedTotalSize || {size: 0, unit: 'B'});
            } else {
                setVisibleData(prev => [...prev, ...list]);
                setTotalCount(total);
            }

            setPage(pageNum);
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
    }, [page, hasMore, activeTab, debouncedSearchQuery, showUnlinkedOnly]);

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
        setDragSelectionBox({
            left: Math.min(startX, currentX),
            top: Math.min(startY, currentY),
            width: Math.abs(currentX - startX),
            height: Math.abs(currentY - startY),
        });
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
            const isIntersecting = !(rect.right < selectRect.left || rect.left > selectRect.right || rect.bottom < selectRect.top || rect.top > selectRect.bottom);
            if (isIntersecting && id) newSelectedIds.add(id);
            else if (id && !initialSelectionRef.current.has(id)) newSelectedIds.delete(id);
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
        const target = e.target as HTMLElement;
        if (e.button !== 0 || target.closest('.resource-card') || target.closest('button')) return;
        isDraggingRef.current = true;
        dragStartRef.current = {x: e.clientX, y: e.clientY};
        const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!isAdditive) {
            setSelectedIds(new Set());
            initialSelectionRef.current = new Set();
        } else {
            initialSelectionRef.current = new Set(selectedIds);
        }
        setDragSelectionBox({left: e.clientX, top: e.clientY, width: 0, height: 0});
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = 'none';
    };

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

    // --- 3. 删除逻辑 ---
    // 点击批量删除
    const handleBatchDeleteClick = () => {
        if (selectedIds.size > 0) {
            setDeletingId(null); // 标记为批量删除
            setIsDeleteModalOpen(true);
        }
    };

    // 点击单个删除
    const handleSingleDeleteClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeletingId(id);
        setIsDeleteModalOpen(true);
    };

    // 确认删除（通用）
    const confirmDelete = async () => {
        const idsToDelete = deletingId ? [deletingId] : Array.from(selectedIds);
        let successCount = 0;
        let failCount = 0;

        try {
            for (const id of idsToDelete) {
                try {
                    await deleteResource(id);
                    successCount++;
                } catch (error: any) {
                    failCount++;
                    console.error(`Delete failed for ${id}:`, error);
                }
            }

            if (successCount > 0) {
                toast.success(`成功删除 ${successCount} 个文件`);
                // 重新请求第一页数据
                const currentVersion = filterVersion.current;
                const response = await getResources({
                    page: 1,
                    pageSize: PAGE_SIZE,
                    type: activeTab === 'all' ? undefined : activeTab,
                    linked: showUnlinkedOnly ? false : undefined,
                    searchQuery: debouncedSearchQuery || undefined
                });
                const {list, total, hasMore: backendHasMore} = response;
                if (filterVersion.current === currentVersion) {
                    setVisibleData(list);
                    setTotalCount(total);
                    setHasMore(backendHasMore);
                    setPage(1);
                }
                setSelectedIds(new Set());
            }

            if (failCount > 0) {
                toast.error(`${failCount} 个文件删除失败 (可能已关联文章)`);
            }

            setIsDeleteModalOpen(false);
            setDeletingId(null);

        } catch (error) {
            console.error('Failed to delete resources:', error);
            toast.error('删除过程发生错误');
        }
    };

    // --- 2. 下载逻辑 ---
    const handleDownloadFile = async (id: string, fileName: string) => {
        try {
            const blob = await downloadResource(id);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return true;
        } catch (error) {
            console.error(`Failed to download ${fileName}:`, error);
            toast.error(`下载 ${fileName} 失败`);
            return false;
        }
    };

    const handleSingleDownload = async (e: React.MouseEvent, file: ResourceItem) => {
        e.stopPropagation();
        toast.info(`开始下载文件: ${file.name}`);
        await handleDownloadFile(file.id, file.name);
    };

    const handleBatchDownload = async () => {
        const ids = Array.from(selectedIds);
        toast.info(`开始批量下载 ${ids.length} 个文件...`);

        // 串行下载以避免浏览器限制并发
        for (const id of ids) {
            const file = visibleData.find(f => f.id === id);
            if (file) {
                await handleDownloadFile(file.id, file.name);
                // 简单的延时，给浏览器喘息时间
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        setSelectedIds(new Set());
    };

    // --- 4. 关联文章跳转 (修复版) ---
    const handleArticleClick = (collId: string, articleId: string) => {
        if (!collId || !articleId) {
            console.warn("Cannot navigate: missing collId or articleId", {collId, articleId});
            return;
        }
        navigate(`/article/${collId}/${articleId}`);
    };

    return (
        <div
            className="w-full min-h-[calc(100vh-80px)] select-none"
            onMouseDown={handleMouseDown}
        >
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

            {/* Delete Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
                         onClick={() => setIsDeleteModalOpen(false)}></div>
                    <div
                        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                        onMouseDown={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div
                                    className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-red-600"/>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">确认删除资源?</h3>
                                    <p className="text-sm text-slate-500">此操作将永久删除文件，无法撤销。</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                                确定要删除 {deletingId ? '该' : `选中的 ${selectedIds.size} 个`} 资源文件吗？
                                <br/>
                                <span className="text-xs text-orange-500 mt-2 block">* 已关联文章的资源将无法删除。</span>
                            </p>
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setIsDeleteModalOpen(false)}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消
                                </button>
                                <button onClick={confirmDelete}
                                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm">确认删除
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Batch Actions Bar */}
            {selectedIds.size > 0 && (
                <div
                    className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-6 z-50 animate-in slide-in-from-bottom-6 duration-300"
                    onMouseDown={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 text-sm font-medium">
                        <span
                            className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">{selectedIds.size}</span>
                        <span>项已选择</span>
                    </div>
                    <div className="h-4 w-px bg-slate-700"></div>
                    <div className="flex items-center gap-2">
                        <button onClick={toggleSelectAll}
                                className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs transition-colors">{selectedIds.size === visibleData.length ? '取消全选' : '全选当前'}</button>
                        <button onClick={handleBatchDownload}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold transition-colors shadow-sm">
                            <Download className="w-3.5 h-3.5"/> 批量下载
                        </button>
                        <button onClick={handleBatchDeleteClick}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-bold transition-colors shadow-sm">
                            <Trash2 className="w-3.5 h-3.5"/> 批量删除
                        </button>
                    </div>
                    <button onClick={() => setSelectedIds(new Set())}
                            className="ml-2 p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4"/></button>
                </div>
            )}

            {/* Main Content */}
            <div
                className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 relative">

                {/* Header (Same as before) */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div onMouseDown={e => e.stopPropagation()}>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            资源库 <span className="text-orange-500">.</span>
                        </h1>
                        <p className="text-slate-500 text-sm mt-1">集中管理您的项目附件、媒体文件与设计素材。</p>
                    </div>

                    <div
                        className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm select-text"
                        onMouseDown={e => e.stopPropagation()}>
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Cloud className="w-5 h-5"/>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 font-medium">已用空间</span>
                            <div className="flex items-end gap-1">
                                <span
                                    className="text-sm font-bold text-slate-800">{formattedTotalSize.size} {formattedTotalSize.unit}</span>
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
                <div
                    className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 bg-white p-2 rounded-xl shadow-sm border border-slate-100 sticky top-[70px] z-30"
                    onMouseDown={e => e.stopPropagation()}>
                    <div className="flex gap-1 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0 scrollbar-hide">
                        {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                            >
                                {React.cloneElement(config.icon, {className: "w-3.5 h-3.5"})}
                                {config.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        <button onClick={() => setShowUnlinkedOnly(!showUnlinkedOnly)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap ${showUnlinkedOnly ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                            {showUnlinkedOnly ? <Link2Off className="w-3.5 h-3.5"/> : <Filter className="w-3.5 h-3.5"/>}
                            {showUnlinkedOnly ? '只看未关联' : '筛选未关联'}
                        </button>
                        <div className="relative flex-1 lg:w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                            <input type="text" placeholder="搜索资源..." value={searchQuery}
                                   onChange={(e) => setSearchQuery(e.target.value)}
                                   className="w-full pl-8 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all"/>
                        </div>
                    </div>
                </div>

                {/* File Grid */}
                {isLoading && visibleData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-orange-500 mb-2"/>
                        <p className="text-sm">正在加载资源...</p>
                    </div>
                ) : visibleData.length > 0 ? (
                    <div ref={gridContainerRef}
                         className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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
                                        <div onClick={(e) => toggleSelection(e, file.id)}
                                             className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white/80 border-slate-300 text-transparent hover:border-orange-400 opacity-0 group-hover:opacity-100'}`}>
                                            <CheckCircle2 className="w-3 h-3"/>
                                        </div>
                                    </div>
                                    <div className="absolute top-2 right-2 z-20 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                        {/* 未关联标签：未选中且未关联时显示，group-hover时隐藏 */}
                                        {!file.linked && !isSelected && (
                                            <div
                                                className="group-hover:hidden px-1.5 py-0.5 bg-red-100/90 text-red-600 text-[10px] font-bold rounded backdrop-blur-sm">未关联</div>
                                        )}

                                        {/* 操作按钮：选中时显示，或hover时显示 */}
                                        <div className={`flex gap-1 ${isSelected ? 'flex' : 'hidden group-hover:flex'}`}>
                                            {/* Download Button */}
                                            <button onClick={(e) => handleSingleDownload(e, file)}
                                                    className="p-1 rounded-md bg-white/90 text-slate-400 hover:text-blue-600 hover:bg-blue-50 shadow-sm border border-slate-200 transition-all"
                                                    title="下载文件">
                                                <Download className="w-3.5 h-3.5"/>
                                            </button>
                                            {/* Delete Button */}
                                            <button onClick={(e) => handleSingleDeleteClick(e, file.id)}
                                                    className="p-1 rounded-md bg-white/90 text-slate-400 hover:text-red-600 hover:bg-red-50 shadow-sm border border-slate-200 transition-all"
                                                    title="删除文件">
                                                <Trash2 className="w-3.5 h-3.5"/>
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        className="aspect-[16/10] bg-slate-50/50 border-b border-slate-100/50 flex items-center justify-center relative">
                                        <div
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 duration-300 ${getFileStyle(file.type)}`}>
                                            {React.cloneElement(getFileIcon(file.type), {className: "w-5 h-5"})}
                                        </div>
                                    </div>
                                    <div className="p-2.5 flex-1 flex flex-col">
                                        <h3 className="text-xs font-medium text-slate-700 truncate mb-1"
                                            title={file.name}>{file.name}</h3>
                                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                                            <span>{formatFileSize(file.size)}</span>
                                            <span>{file.date}</span>
                                        </div>
                                        {file.sourceArticle ? (
                                            <div
                                                className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1.5 text-[10px] text-slate-400 group/source"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleArticleClick(file.sourceArticle!.collId, file.sourceArticle!.id);
                                                }}>
                                                <BookOpen
                                                    className="w-3 h-3 text-slate-300 group-hover/source:text-orange-400 transition-colors"/>
                                                <span
                                                    className="truncate group-hover/source:text-orange-600 group-hover/source:underline cursor-pointer transition-colors"
                                                    title={file.sourceArticle.title}>{file.sourceArticle.title}</span>
                                            </div>
                                        ) : (
                                           <div className="mt-2 pt-2 border-t border-slate-50 h-6 flex items-center">
                                                <span className="text-[10px] text-slate-300">未关联</span>
                                           </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div
                        className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-dashed border-slate-200">
                        <Filter className="w-8 h-8 text-slate-300 mb-2 opacity-50"/>
                        <p className="text-sm">暂无符合条件的资源</p>
                        <button onClick={() => {
                            setActiveTab('all');
                            setSearchQuery('');
                            setShowUnlinkedOnly(false);
                        }} className="mt-2 text-xs text-orange-500 hover:underline">重置所有筛选
                        </button>
                    </div>
                )}

                {visibleData.length > 0 && (
                    <div className="flex justify-center mt-6 mb-10 text-center">
                        {isLoading ? <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2
                            className="w-4 h-4 animate-spin"/> 正在加载更多...</div> : !hasMore &&
                            <div className="text-slate-300 text-xs">— 到底了，共 {totalCount} 个文件 —</div>}
                    </div>
                )}
            </div>
        </div>
    );
}