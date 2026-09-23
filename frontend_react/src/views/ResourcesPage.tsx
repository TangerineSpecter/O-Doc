import React, {useState, useEffect, useCallback, useRef} from 'react';
import {useToast} from '../components/common/ToastProvider';
import {useNavigate} from 'react-router-dom';
import PageLoading from '../components/common/PageLoading';
import AuthenticatedResourceImage from '../components/common/AuthenticatedResourceImage';

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

const getResourcePreviewUrl = (file: ResourceItem) =>
    file.type === 'image' ? `/api/resource/view/${file.id}` : '';

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
    const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(() => new URLSearchParams(window.location.search).get('linked') === 'false');
    const [showMissingOnly, setShowMissingOnly] = useState(() => new URLSearchParams(window.location.search).get('missing') === 'true');

    const [visibleData, setVisibleData] = useState<ResourceItem[]>([]);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [totalCount, setTotalCount] = useState(0);
    const [formattedTotalSize, setFormattedTotalSize] = useState<FormattedSize>({size: 0, unit: 'B'});
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [previewFile, setPreviewFile] = useState<ResourceItem | null>(null);

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
    }, [activeTab, debouncedSearchQuery, showUnlinkedOnly, showMissingOnly]);

    // 获取资源列表数据
    const fetchResources = async (pageNum: number) => {
        const currentVersion = filterVersion.current;
        try {
            const params: GetResourcesParams = {
                page: pageNum,
                pageSize: PAGE_SIZE,
                type: activeTab === 'all' ? undefined : activeTab,
                linked: showUnlinkedOnly ? false : undefined,
                missing: showMissingOnly || undefined,
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
    }, [page, hasMore, activeTab, debouncedSearchQuery, showUnlinkedOnly, showMissingOnly]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setSelectedIds(new Set());
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

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
                    missing: showMissingOnly || undefined,
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
        if (!file.fileExists) {
            toast.error(`文件 ${file.name} 已不在本地，无法下载`);
            return;
        }
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
                if (!file.fileExists) {
                    toast.error(`已跳过缺失文件：${file.name}`);
                    continue;
                }
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

    const handleImageClick = (collId: string) => {
        if (!collId) {
            console.warn("Cannot navigate: missing image anthology collId", {collId});
            return;
        }
        navigate(`/image/${collId}`);
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
                    className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] sm:w-auto max-w-lg bg-slate-900 text-white px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl shadow-2xl flex items-center justify-between sm:justify-start gap-2 sm:gap-6 z-50 animate-in slide-in-from-bottom-6 duration-300"
                    onMouseDown={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-medium">
                        <span
                            className="bg-orange-500 text-white text-[11px] sm:text-xs px-1.5 py-0.5 rounded font-mono">{selectedIds.size}</span>
                        <span className="whitespace-nowrap">已选择</span>
                    </div>
                    <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <button onClick={toggleSelectAll}
                                className="px-2 sm:px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs transition-colors whitespace-nowrap">{selectedIds.size === visibleData.length ? '取消全选' : '全选'}</button>
                        <button onClick={handleBatchDownload}
                                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold transition-colors shadow-sm whitespace-nowrap">
                            <Download className="w-3.5 h-3.5"/> 批量下载
                        </button>
                        <button onClick={handleBatchDeleteClick}
                                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-xs font-bold transition-colors shadow-sm whitespace-nowrap">
                            <Trash2 className="w-3.5 h-3.5"/> 批量删除
                        </button>
                    </div>
                    <button onClick={() => {
                        setSelectedIds(new Set());
                        setIsSelectMode(false);
                    }}
                            className="ml-1 p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                        <X className="w-4 h-4"/></button>
                </div>
            )}

            {/* 移动端资源详情与操作弹窗 */}
            {previewFile && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPreviewFile(null)} />
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onMouseDown={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className={`p-1.5 rounded-lg ${getFileStyle(previewFile.type)}`}>
                                    {React.cloneElement(getFileIcon(previewFile.type), {className: "w-4 h-4"})}
                                </span>
                                <h3 className="text-sm font-bold text-slate-800 truncate" title={previewFile.name}>{previewFile.name}</h3>
                            </div>
                            <button onClick={() => setPreviewFile(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* 图片或图标预览区域 */}
                            <div className="w-full aspect-[16/10] bg-slate-50 rounded-xl overflow-hidden border border-slate-100 flex items-center justify-center">
                                {getResourcePreviewUrl(previewFile) ? (
                                    <AuthenticatedResourceImage resourceId={previewFile.id} alt={previewFile.name} className="w-full h-full object-contain" loading="eager"/>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <div className={`p-3 rounded-xl ${getFileStyle(previewFile.type)}`}>
                                            {React.cloneElement(getFileIcon(previewFile.type), {className: "w-8 h-8"})}
                                        </div>
                                        <span className="text-xs">{TYPE_CONFIG[previewFile.type]?.label || '文件'}</span>
                                    </div>
                                )}
                            </div>

                            {/* 元数据 */}
                            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div>
                                    <span className="text-slate-400">大小：</span>
                                    <span className="font-medium text-slate-700 ml-1">{formatFileSize(previewFile.size)}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400">上传时间：</span>
                                    <span className="font-medium text-slate-700 ml-1">{previewFile.date}</span>
                                </div>
                                <div className="col-span-2 flex items-center gap-1.5 pt-1 border-t border-slate-100/80 mt-1">
                                    <span className="text-slate-400">关联：</span>
                                    {previewFile.sourceArticle ? (
                                        <button
                                            onClick={() => {
                                                setPreviewFile(null);
                                                handleArticleClick(previewFile.sourceArticle!.collId, previewFile.sourceArticle!.id);
                                            }}
                                            className="text-orange-600 hover:underline truncate flex items-center gap-1"
                                        >
                                            <BookOpen className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{previewFile.sourceArticle.title}</span>
                                        </button>
                                    ) : previewFile.sourceImage ? (
                                        <button
                                            onClick={() => {
                                                setPreviewFile(null);
                                                handleImageClick(previewFile.sourceImage!.collId);
                                            }}
                                            className="text-orange-600 hover:underline truncate flex items-center gap-1"
                                        >
                                            <ImageIcon className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{previewFile.sourceImage.title}</span>
                                        </button>
                                    ) : previewFile.sourceBook ? (
                                        <span className="text-slate-600 truncate">书架 · {previewFile.sourceBook.title}</span>
                                    ) : (
                                        <span className="text-slate-400">未关联任何文章</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
                            <button
                                onClick={() => {
                                    setIsSelectMode(true);
                                    setSelectedIds(new Set([previewFile.id]));
                                    setPreviewFile(null);
                                }}
                                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-100"
                            >
                                勾选此项
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        handleSingleDeleteClick(e, previewFile.id);
                                        setPreviewFile(null);
                                    }}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs hover:bg-red-100"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    删除
                                </button>
                                <button
                                    onClick={(e) => {
                                        handleSingleDownload(e, previewFile);
                                    }}
                                    disabled={!previewFile.fileExists}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 disabled:opacity-50 shadow-sm"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    下载
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <div
                className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 animate-in fade-in duration-200 pb-24 relative">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <div onMouseDown={e => e.stopPropagation()}>
                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-1.5 sm:gap-2">
                            资源库 <span className="text-orange-500">.</span>
                        </h1>
                        <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1">集中管理您的项目附件、媒体文件与设计素材。</p>
                    </div>

                    {/* 容量统计卡片：在移动端自适应排布，完整呈现已用空间、进度条和资源数 */}
                    <div
                        className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-4 bg-white px-3 sm:px-4 py-2 rounded-xl border border-slate-200 shadow-sm select-text"
                        onMouseDown={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2 sm:gap-2.5">
                            <div className="p-1.5 sm:p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                                <Cloud className="w-4 h-4 sm:w-5 sm:h-5"/>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-slate-400 font-medium leading-none mb-1">已用空间</span>
                                <div className="flex items-baseline gap-1 leading-none">
                                    <span
                                        className="text-xs sm:text-sm font-bold text-slate-800">{formattedTotalSize.size} {formattedTotalSize.unit}</span>
                                    <span className="text-[10px] text-slate-400">/ 50 GB</span>
                                </div>
                            </div>
                        </div>
                        <div className="w-16 sm:w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                            <div className="h-full bg-blue-500 rounded-full" style={{width: `${Math.min(100, Math.max(5, (formattedTotalSize.unit === 'GB' ? (formattedTotalSize.size / 50) * 100 : 3)))}%`}}></div>
                        </div>
                        <div className="w-px h-6 bg-slate-100"></div>
                        <div className="flex flex-col items-end sm:items-start shrink-0">
                            <span className="text-[10px] text-slate-400 font-medium leading-none mb-1">资源数</span>
                            <div className="flex items-baseline gap-0.5 leading-none">
                                <span className="text-xs sm:text-sm font-bold text-slate-800">{totalCount || visibleData.length}</span>
                                <span className="text-[10px] text-slate-400">个</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Toolbar：针对移动端分层重构，搜索框全宽，类型条横滑，筛选与管理独立 */}
                <div
                    className="flex flex-col gap-2.5 mb-5 sm:mb-6 bg-white p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 sticky top-[60px] sm:top-[70px] z-30"
                    onMouseDown={e => e.stopPropagation()}>

                    {/* 顶行：全宽搜索输入框 + 批量管理开关 */}
                    <div className="flex items-center gap-2 w-full">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400"/>
                            <input
                                type="text"
                                placeholder="搜索资源名称、格式..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 focus:bg-white transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-3 h-3"/>
                                </button>
                            )}
                        </div>
                        <button
                            onClick={() => {
                                if (isSelectMode) {
                                    setSelectedIds(new Set());
                                    setIsSelectMode(false);
                                } else {
                                    setIsSelectMode(true);
                                }
                            }}
                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all whitespace-nowrap shrink-0 ${isSelectMode ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-orange-200'}`}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isSelectMode ? '退出管理' : '批量管理'}</span>
                        </button>
                    </div>

                    {/* 中行：分类滑动条 */}
                    <div className="flex gap-1 overflow-x-auto w-full pb-0.5 scrollbar-hide touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                        {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0 ${activeTab === key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 bg-slate-50/60'}`}
                            >
                                {React.cloneElement(config.icon, {className: "w-3 h-3"})}
                                {config.label}
                            </button>
                        ))}
                    </div>

                    {/* 底行：快捷筛选 Chips */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden text-xs pt-1 border-t border-slate-50">
                        <button onClick={() => setShowMissingOnly(!showMissingOnly)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all whitespace-nowrap ${showMissingOnly ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                            <AlertTriangle className="w-3 h-3"/>
                            {showMissingOnly ? '已筛选缺失' : '筛选已缺失'}
                        </button>
                        <button onClick={() => setShowUnlinkedOnly(!showUnlinkedOnly)}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-all whitespace-nowrap ${showUnlinkedOnly ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                            {showUnlinkedOnly ? <Link2Off className="w-3 h-3"/> : <Filter className="w-3 h-3"/>}
                            {showUnlinkedOnly ? '已筛选未关联' : '筛选未关联'}
                        </button>
                        {(showMissingOnly || showUnlinkedOnly || activeTab !== 'all' || searchQuery) && (
                            <button
                                onClick={() => {
                                    setActiveTab('all');
                                    setSearchQuery('');
                                    setShowUnlinkedOnly(false);
                                    setShowMissingOnly(false);
                                }}
                                className="text-[11px] text-orange-600 hover:underline px-1 whitespace-nowrap ml-auto"
                            >
                                重置筛选
                            </button>
                        )}
                    </div>
                </div>

                {/* File Grid */}
                {isLoading && visibleData.length === 0 ? (
                    <PageLoading message="正在加载资源库..." minHeight="min-h-[380px]" />
                ) : visibleData.length > 0 ? (
                    <div ref={gridContainerRef}
                         className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3 animate-in fade-in duration-200">
                        {visibleData.map((file) => {
                            const isSelected = selectedIds.has(file.id);
                            return (
                                <div
                                    key={file.id}
                                    data-id={file.id}
                                    onClick={(e) => {
                                        if (isSelectMode) {
                                            toggleSelection(e, file.id);
                                        } else {
                                            setPreviewFile(file);
                                        }
                                    }}
                                    className={`resource-card group relative bg-white rounded-xl border transition-all duration-200 cursor-pointer flex flex-col select-none ${isSelected ? 'border-orange-500 ring-1 ring-orange-500 bg-orange-50/5 shadow-md' : 'border-slate-200 hover:border-orange-300 hover:shadow-md'}`}
                                >
                                    {/* 多选勾选框：多选模式下常驻可见；普通模式桌面hover可见 */}
                                    <div className={`absolute top-2 left-2 z-20 ${isSelectMode || isSelected ? 'block' : 'opacity-0 group-hover:opacity-100 sm:block'}`} onClick={(e) => toggleSelection(e, file.id)}>
                                        <div
                                             className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white/90 border-slate-300 text-transparent hover:border-orange-400'}`}>
                                            <CheckCircle2 className="w-3 h-3"/>
                                        </div>
                                    </div>

                                    {/* 右上角状态或操作 */}
                                    <div className="absolute top-2 right-2 z-20 flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                        {!file.linked && !isSelected && (
                                            <div
                                                className="px-1.5 py-0.5 bg-red-100/90 text-red-600 text-[9px] sm:text-[10px] font-bold rounded backdrop-blur-sm">未关联</div>
                                        )}
                                        {!file.fileExists && !isSelected && (
                                            <div className="px-1.5 py-0.5 bg-amber-100/90 text-amber-700 text-[9px] sm:text-[10px] font-bold rounded backdrop-blur-sm">缺失</div>
                                        )}

                                        {/* 桌面端快速操作按钮 */}
                                        <div className={`gap-1 hidden sm:group-hover:flex ${isSelected ? 'sm:flex' : ''}`}>
                                            <button onClick={(e) => handleSingleDownload(e, file)} disabled={!file.fileExists}
                                                    className="p-1 rounded-md bg-white/90 text-slate-400 hover:text-blue-600 hover:bg-blue-50 shadow-sm border border-slate-200 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                                    title={file.fileExists ? '下载文件' : '文件已不在本地'}>
                                                <Download className="w-3.5 h-3.5"/>
                                            </button>
                                            <button onClick={(e) => handleSingleDeleteClick(e, file.id)}
                                                    className="p-1 rounded-md bg-white/90 text-slate-400 hover:text-red-600 hover:bg-red-50 shadow-sm border border-slate-200 transition-all"
                                                    title="删除文件">
                                                <Trash2 className="w-3.5 h-3.5"/>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 缩略图/图标 */}
                                    <div
                                        className="aspect-[16/10] bg-slate-50/50 border-b border-slate-100/50 flex items-center justify-center relative overflow-hidden">
                                        {getResourcePreviewUrl(file) ? (
                                            <AuthenticatedResourceImage
                                                resourceId={file.id}
                                                alt={file.name}
                                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                                draggable={false}
                                            />
                                        ) : (
                                            <div
                                                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 duration-300 ${getFileStyle(file.type)}`}>
                                                {React.cloneElement(getFileIcon(file.type), {className: "w-4 h-4 sm:w-5 sm:h-5"})}
                                            </div>
                                        )}
                                    </div>

                                    {/* 信息文字 */}
                                    <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <h3 className="text-xs font-medium text-slate-700 truncate mb-1"
                                                title={file.name}>{file.name}</h3>
                                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                                <span>{formatFileSize(file.size)}</span>
                                                <span className="truncate max-w-[80px]">{file.date}</span>
                                            </div>
                                        </div>
                                        {file.sourceArticle ? (
                                            <div
                                                className="mt-1.5 pt-1.5 border-t border-slate-50 flex items-center gap-1 text-[10px] text-slate-400 group/source"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleArticleClick(file.sourceArticle!.collId, file.sourceArticle!.id);
                                                }}>
                                                <BookOpen
                                                    className="w-3 h-3 text-slate-300 group-hover/source:text-orange-400 transition-colors shrink-0"/>
                                                <span
                                                    className="truncate group-hover/source:text-orange-600 group-hover/source:underline cursor-pointer transition-colors"
                                                    title={file.sourceArticle.title}>{file.sourceArticle.title}</span>
                                            </div>
                                        ) : file.sourceImage ? (
                                            <div
                                                className="mt-1.5 pt-1.5 border-t border-slate-50 flex items-center gap-1 text-[10px] text-slate-400 group/source"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleImageClick(file.sourceImage!.collId);
                                                }}>
                                                <ImageIcon
                                                    className="w-3 h-3 text-slate-300 group-hover/source:text-orange-400 transition-colors shrink-0"/>
                                                <span
                                                    className="truncate group-hover/source:text-orange-600 group-hover/source:underline cursor-pointer transition-colors"
                                                    title={file.sourceImage.title}>{file.sourceImage.title}</span>
                                            </div>
                                        ) : file.sourceBook ? (
                                            <div className="mt-1.5 pt-1.5 border-t border-slate-50 flex items-center gap-1 text-[10px] text-slate-400">
                                                <BookOpen className="w-3 h-3 text-slate-300 shrink-0"/>
                                                <span className="truncate" title={file.sourceBook.title}>书架 · {file.sourceBook.title}</span>
                                            </div>
                                        ) : (
                                           <div className="mt-1.5 pt-1.5 border-t border-slate-50 h-5 flex items-center">
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
                            setShowMissingOnly(false);
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
