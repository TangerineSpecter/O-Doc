import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    ChevronDown, BookOpen, FileText, Cpu, Layers, Zap, Globe, Filter,
    ArrowUpDown, ArrowUp, Lock, Cloud, Folder, Briefcase, Layout, Box,
    Hexagon, Command, Target, Grid, HardDrive, PenTool, Archive,
    Activity, Database, Shield, Code, Terminal, Server, Plus,
    X, Check, Search, GripHorizontal, Loader2, MoreHorizontal, Edit, Trash
} from 'lucide-react';
import { createAnthology, CreateAnthologyParams, getAnthologyList, sortAnthology, Anthology } from '../api/anthology';
import { useToast } from '../components/ToastProvider';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// --- 接口定义 ---
interface ArticleSummary {
    article_id: string;
    title: string;
    date: string;
}

interface Collection extends Anthology {
    icon: React.ReactNode;
}

interface HomePageProps {
    onNavigate: (viewName: string, params?: any) => void;
}

interface IconItem {
    id: string;
    icon: React.ReactElement<any>;
    color: string;
}

// --- 图标库 ---
const availableIcons: IconItem[] = [
    { id: 'book', icon: <BookOpen />, color: "text-blue-500" },
    { id: 'code', icon: <Code />, color: "text-sky-500" },
    { id: 'server', icon: <Server />, color: "text-violet-500" },
    { id: 'database', icon: <Database />, color: "text-indigo-500" },
    { id: 'shield', icon: <Shield />, color: "text-teal-500" },
    { id: 'zap', icon: <Zap />, color: "text-orange-500" },
    { id: 'cloud', icon: <Cloud />, color: "text-cyan-500" },
    { id: 'folder', icon: <Folder />, color: "text-yellow-500" },
    { id: 'briefcase', icon: <Briefcase />, color: "text-amber-700" },
    { id: 'layout', icon: <Layout />, color: "text-pink-500" },
    { id: 'box', icon: <Box />, color: "text-fuchsia-500" },
    { id: 'terminal', icon: <Terminal />, color: "text-slate-700" },
    { id: 'activity', icon: <Activity />, color: "text-rose-500" },
    { id: 'hexagon', icon: <Hexagon />, color: "text-lime-600" },
    { id: 'command', icon: <Command />, color: "text-gray-500" },
    { id: 'target', icon: <Target />, color: "text-red-600" },
    { id: 'grid', icon: <Grid />, color: "text-emerald-500" },
    { id: 'harddrive', icon: <HardDrive />, color: "text-slate-500" },
    { id: 'pentool', icon: <PenTool />, color: "text-purple-600" },
    { id: 'archive', icon: <Archive />, color: "text-amber-600" },
];

// 模拟数据
const manualData: Collection[] = [
    {
        id: 1,
        coll_id: "col_deploy_001",
        title: "小橘部署指南",
        count: 42,
        icon: <Cpu className="w-4 h-4 text-orange-500" />,
        isTop: true,
        permission: 'public',
        description: "全面介绍小橘文档私有化部署、Docker容器化及集群配置方案。",
        articles: [
            { article_id: "art_dep_101", title: "服务器环境依赖检查清单", date: "11-24" },
            { article_id: "art_dep_102", title: "Docker Compose 一键部署", date: "11-20" },
            { article_id: "art_dep_103", title: "Nginx 反向代理配置详解", date: "11-18" },
        ]
    }
];
const initialCollectionsData: Collection[] = manualData;

// --- Sortable Item Component ---
interface SortableCollectionCardProps {
    item: Collection;
    onNavigate: (viewName: string, params?: any) => void;
    isMenuOpen: boolean;
    onToggleMenu: (e: React.MouseEvent) => void;
    onEdit: () => void;
    onDelete: () => void;
}

const SortableCollectionCard = ({ item, onNavigate, isMenuOpen, onToggleMenu, onEdit, onDelete }: SortableCollectionCardProps) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: item.id,
        disabled: item.isTop
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        // 🔥 关键修复：当拖拽时，显式设置为 'none'，强制覆盖 CSS 类中的 transition-all
        // 只有不拖拽且发生位置交换时，才使用 dnd-kit 提供的平滑 transition
        transition: isDragging ? 'none' : transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
        touchAction: 'none'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`
                group bg-white rounded-xl border transition-all duration-200 flex flex-col overflow-hidden relative
                ${isDragging ? 'shadow-2xl ring-2 ring-orange-400 opacity-90 scale-[1.02] z-50' : 'border-slate-200 hover:border-orange-200 hover:shadow-lg'}
                ${item.isTop ? 'bg-slate-50/30' : ''}
            `}
        >
            {/* 2. 拖拽手柄：完全内收，不再溢出
               - top-1.5: 放在内部
               - hover:bg-slate-100: 增加交互感
            */}
            {!item.isTop && (
                <div
                    {...attributes}
                    {...listeners}
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 w-12 h-5 flex items-center justify-center rounded-full text-slate-300 hover:text-orange-500 hover:bg-orange-50 cursor-grab active:cursor-grabbing z-30 transition-colors opacity-0 group-hover:opacity-100"
                    title="按住拖动排序"
                >
                    <GripHorizontal className="w-4 h-4" />
                </div>
            )}

            {/* 3. 右上角菜单按钮 */}
            <div className="absolute top-2 right-2 z-20">
                <button
                    onClick={onToggleMenu}
                    className={`p-1.5 rounded-md transition-colors ${isMenuOpen ? 'bg-orange-50 text-orange-600' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-600 opacity-0 group-hover:opacity-100'}`}
                >
                    <MoreHorizontal className="w-4 h-4" />
                </button>

                {/* Dropdown Menu */}
                {isMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-28 bg-white rounded-lg shadow-xl border border-slate-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-orange-600 flex items-center gap-2"
                        >
                            <Edit className="w-3.5 h-3.5" /> 编辑
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                        >
                            <Trash className="w-3.5 h-3.5" /> 删除
                        </button>
                    </div>
                )}
            </div>

            {/* Card Header */}
            <div className="p-3 pb-2 pt-6"> {/* pt-6 增加顶部内边距，给手柄留位 */}
                <div className="flex justify-between items-start mb-2 pr-6">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-slate-50 rounded-md border border-slate-100 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                            {item.icon}
                        </div>
                        <div className="flex items-center gap-2">
                            <h3
                                onClick={() => onNavigate('article', { collId: item.coll_id, title: item.title })}
                                className="font-bold text-slate-800 text-base leading-tight group-hover:text-orange-600 transition-colors cursor-pointer line-clamp-1"
                            >
                                {item.title}
                            </h3>
                            {item.isTop && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-50 border border-red-100 text-[10px] font-bold text-red-600 leading-none"><ArrowUp className="w-2.5 h-2.5" strokeWidth={3} />置顶</span>}
                            {item.permission === 'private' && <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-500 leading-none"><Lock className="w-2.5 h-2.5" /></span>}
                        </div>
                    </div>
                    <span className="bg-slate-50 text-slate-400 text-[10px] font-semibold px-1.5 py-0.5 rounded min-w-[1.5rem] text-center">{item.count}</span>
                </div>
                <p className="text-slate-500 text-xs line-clamp-2 leading-relaxed mb-2 h-9">{item.description}</p>
            </div>

            {/* Article List */}
            <div className="flex-1 bg-slate-50/30 border-t border-slate-100 p-1">
                {item.articles && item.articles.length > 0 ? (
                    <ul className="space-y-0.5">
                        {item.articles.map((article, idx) => (
                            <li key={idx}
                                onClick={() => onNavigate('article', { collId: item.coll_id, articleId: article.article_id, title: item.title, articleTitle: article.title })}
                                className="group/item flex items-center justify-between py-1.5 px-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer"
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <FileText className="w-3 h-3 text-slate-300 group-hover/item:text-orange-500 flex-shrink-0" />
                                    <span className="text-xs text-slate-600 truncate group-hover/item:text-slate-900 transition-colors">{article.title}</span>
                                </div>
                                <span className="text-[10px] text-slate-300 font-mono whitespace-nowrap pl-2">{article.date}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 py-4 gap-2">
                        <div className="bg-white p-2 rounded-full border border-dashed border-slate-300"><Plus className="w-4 h-4 text-slate-300" /></div>
                        <span className="text-[10px]">暂无文档，点击创建</span>
                    </div>
                )}
            </div>

            <div className="bg-white border-t border-slate-50 h-0 group-hover:h-8 transition-all duration-300 overflow-hidden flex items-center justify-center">
                <button
                    onClick={() => onNavigate('article', { collId: item.coll_id, title: item.title })}
                    className="text-[10px] font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity delay-75"
                >
                    查看全部 <ChevronDown className="w-2.5 h-2.5 -rotate-90" />
                </button>
            </div>
        </div>
    );
}

// --- Main HomePage Component ---
export default function HomePage({ onNavigate }: HomePageProps) {
    const [collections, setCollections] = useState<Collection[]>([]);
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // 状态：当前打开的菜单 ID
    const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            // 确保 distance 为 0，保证即点即拖
            activationConstraint: {
                distance: 0,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchCollections = async () => {
        setLoading(true);
        try {
            const data = await getAnthologyList();
            const processedData = data.map((anthology: any) => {
                const iconItem = availableIcons.find(icon => icon.id === anthology.iconId) || availableIcons[0];
                return {
                    ...anthology,
                    articles: anthology.articles || [],
                    count: anthology.count || 0,
                    icon: React.cloneElement(iconItem.icon, { className: `w-4 h-4 ${iconItem.color}` })
                };
            });
            // 按 sort 排序
            processedData.sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0));
            setCollections(processedData);
        } catch (error) {
            console.error('获取列表失败', error);
            setCollections(initialCollectionsData as any);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCollections();
    }, []);

    // Filter & Sort
    const [filterType, setFilterType] = useState('all');
    const [sortType, setSortType] = useState('default');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [visibleCount, setVisibleCount] = useState(12);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    // Create Modal
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    interface NewCollectionData {
        title: string;
        description: string;
        iconId: string;
        permission: 'public' | 'private';
    }
    const [newCollectionData, setNewCollectionData] = useState<NewCollectionData>({
        title: "", description: "", iconId: "book", permission: "public"
    });

    const processedAllCollections = useMemo(() => {
        let result = [...collections];
        if (filterType === 'top') result = result.filter(item => item.isTop);
        if (sortType === 'count') result.sort((a, b) => b.count - a.count);
        else if (sortType === 'az') result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        return result;
    }, [filterType, sortType, collections]);

    const visibleCollections = useMemo(() => {
        return processedAllCollections.slice(0, visibleCount);
    }, [processedAllCollections, visibleCount]);

    const hasMore = visibleCollections.length < processedAllCollections.length;

    // --- Drag Handlers ---
    const handleDragStart = () => {
        setActiveMenuId(null);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = collections.findIndex((c) => c.id === active.id);
        const newIndex = collections.findIndex((c) => c.id === over.id);

        const newCollections = arrayMove(collections, oldIndex, newIndex);
        setCollections(newCollections);

        // --- 核心修复开始 ---
        const draggedItem = newCollections[newIndex];
        
        // 1. 计算置顶项的数量
        const pinnedCount = collections.filter(c => c.isTop).length;
        
        // 2. 计算相对排序 (从 1 开始)
        // 逻辑：当前绝对索引(newIndex) - 置顶数量(pinnedCount) + 1
        // 例如：置顶有1个(index 0)。
        // 拖到普通项第1位 -> 绝对index 1 -> 1 - 1 + 1 = 1 (sort 1)
        // 拖到普通项第3位 -> 绝对index 3 -> 3 - 1 + 1 = 3 (sort 3)
        let newSortOrder = newIndex - pinnedCount + 1;

        // 3. 边界防御：如果拖拽逻辑异常导致计算出 <= 0，兜底为 1
        if (newSortOrder < 1) newSortOrder = 1;
        // --- 核心修复结束 ---

        try {
            await sortAnthology(draggedItem.coll_id, newSortOrder);
            toast.success('排序已更新');
        } catch (error) {
            console.error('排序更新失败', error);
            toast.error('排序同步失败');
            const reverted = arrayMove(newCollections, newIndex, oldIndex);
            setCollections(reverted);
        }
    };

    // --- Scroll Handler ---
    const handleScroll = useCallback(() => {
        if (isLoadingMore || !hasMore) return;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        if (scrollTop + window.innerHeight >= document.documentElement.scrollHeight - 100) {
            setIsLoadingMore(true);
            setTimeout(() => {
                setVisibleCount(prev => prev + 6);
                setIsLoadingMore(false);
            }, 800);
        }
    }, [isLoadingMore, hasMore]);

    useEffect(() => {
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // --- Actions ---
    const handleCreateCollection = async () => {
        if (!newCollectionData.title) return;
        setIsCreating(true);
        try {
            const params: CreateAnthologyParams = {
                title: newCollectionData.title,
                description: newCollectionData.description,
                iconId: newCollectionData.iconId,
                permission: newCollectionData.permission === 'public' ? 'public' : 'private',
                sort: collections.length + 1
            };
            const response = await createAnthology(params);

            const foundIcon = availableIcons.find(i => i.id === newCollectionData.iconId) || availableIcons[0];
            const iconElement = React.cloneElement(foundIcon.icon, { className: `w-4 h-4 ${foundIcon.color}` });

            const newItem: Collection = {
                ...response,
                articles: [],
                count: 0,
                isTop: false,
                icon: iconElement
            };

            setCollections((prev: Collection[]) => {
                const pinned = prev.filter((c: Collection) => c.isTop);
                const unpinned = prev.filter((c: Collection) => !c.isTop);
                return [...pinned, newItem, ...unpinned];
            });

            setIsCreateModalOpen(false);
            setNewCollectionData({ title: "", description: "", iconId: "book", permission: "public" });
            toast.success("文集创建成功！");
        } catch (error) {
            console.error(error);
            toast.error("创建失败");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDelete = (id: number) => {
        if (confirm('确定要删除该文集吗？此操作无法恢复。')) {
            setCollections(prev => prev.filter(c => c.id !== id));
            toast.success('文集已删除');
            setActiveMenuId(null);
        }
    };

    const handleEdit = (item: Collection) => {
        setNewCollectionData({
            title: item.title,
            description: item.description,
            iconId: item.iconId,
            permission: item.permission
        });
        setIsCreateModalOpen(true);
        setActiveMenuId(null);
    };

    return (
        <div onClick={() => { setIsFilterOpen(false); setIsSortOpen(false); setActiveMenuId(null); }}>

            {/* Create Modal */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => !isCreating && setIsCreateModalOpen(false)}></div>
                    <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                            <h3 className="text-lg font-bold text-slate-800">新建文集</h3>
                            <button onClick={() => setIsCreateModalOpen(false)} disabled={isCreating} className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">文集名称 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    disabled={isCreating}
                                    placeholder='请输入文集名称，最多 20 个字'
                                    maxLength={20}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
                                    value={newCollectionData.title}
                                    onChange={(e) => setNewCollectionData({ ...newCollectionData, title: e.target.value })}
                                    autoFocus
                                />
                                <span className={`text-xs ${newCollectionData.title.length > 20 ? 'text-red-500' : 'text-slate-500'}`}>{Math.min(newCollectionData.title.length, 20)}/20 字</span>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">简介说明</label>
                                <textarea
                                    disabled={isCreating}
                                    rows={3}
                                    placeholder='请在此处输入文集的简介说明，最多支持 100 个字。'
                                    maxLength={100}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm resize-none"
                                    value={newCollectionData.description}
                                    onChange={(e) => setNewCollectionData({ ...newCollectionData, description: e.target.value })}
                                />
                                <span className={`text-xs ${newCollectionData.description.length > 100 ? 'text-red-500' : 'text-slate-500'}`}>{Math.min(newCollectionData.description.length, 100)}/100 字</span>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">选择图标</label>
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent -mx-1 px-1">
                                    {availableIcons.map((item) => (
                                        <button
                                            key={item.id}
                                            disabled={isCreating}
                                            onClick={() => setNewCollectionData({ ...newCollectionData, iconId: item.id })}
                                            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${newCollectionData.iconId === item.id ? 'bg-orange-50 border-orange-500 text-orange-600 ring-2 ring-orange-200' : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300 hover:text-slate-600'}`}
                                        >
                                            {React.cloneElement(item.icon, { className: "w-5 h-5" })}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-slate-700">访问权限</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div
                                        onClick={() => !isCreating && setNewCollectionData({ ...newCollectionData, permission: 'public' })}
                                        className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${newCollectionData.permission === 'public' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'} ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`p-2 rounded-full ${newCollectionData.permission === 'public' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><Globe className="w-4 h-4" /></div>
                                        <div><div className="text-sm font-medium text-slate-800">公开文集</div><div className="text-xs text-slate-500">所有访客可见</div></div>
                                    </div>
                                    <div
                                        onClick={() => !isCreating && setNewCollectionData({ ...newCollectionData, permission: 'private' })}
                                        className={`cursor-pointer p-3 border rounded-lg flex items-center gap-3 transition-all ${newCollectionData.permission === 'private' ? 'bg-orange-50 border-orange-500 ring-1 ring-orange-500' : 'bg-white border-slate-200 hover:border-slate-300'} ${isCreating ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        <div className={`p-2 rounded-full ${newCollectionData.permission === 'private' ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}><Lock className="w-4 h-4" /></div>
                                        <div><div className="text-sm font-medium text-slate-800">私密文集</div><div className="text-xs text-slate-500">仅团队成员可见</div></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                disabled={isCreating}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateCollection}
                                disabled={!newCollectionData.title || isCreating}
                                className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isCreating ? (<><Loader2 className="w-4 h-4 animate-spin" /> 创建中...</>) : ('立即创建')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Filter Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                    <div className="relative">
                        <button className="flex items-center gap-2 text-slate-700 font-semibold text-base hover:text-orange-600 transition-colors pl-2">
                            所有文集 ({processedAllCollections.length})
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-grow sm:flex-grow-0">
                            <input type="text" placeholder="筛选文集..." className="pl-3 pr-8 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-full sm:w-40" />
                            <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                        {/* Filter */}
                        <div className="relative">
                            <button className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${filterType !== 'all' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`} onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}>
                                <Filter className="w-3.5 h-3.5" />
                                <span>{filterType === 'all' ? '筛选' : filterType === 'top' ? '仅置顶' : '筛选'}</span>
                            </button>
                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setFilterType('all')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">全部{filterType === 'all' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setFilterType('top')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">只看置顶{filterType === 'top' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>
                        {/* Sort */}
                        <div className="relative">
                            <button className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${sortType !== 'default' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`} onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}>
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>{sortType === 'default' ? '排序' : sortType === 'count' ? '按数量' : '按名称'}</span>
                            </button>
                            {isSortOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setSortType('default')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">默认排序{sortType === 'default' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('count')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按数量 (多→少){sortType === 'count' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('az')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按名称 (A-Z){sortType === 'az' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                        <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95">
                            <Plus className="w-3.5 h-3.5" strokeWidth={3} /><span className="hidden sm:inline">新建文集</span><span className="sm:hidden">新建</span>
                        </button>
                    </div>
                </div>

                {/* --- dnd-kit Context Wrap --- */}
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={visibleCollections.map(c => c.id)}
                        strategy={rectSortingStrategy}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
                            {visibleCollections.map((item) => (
                                <SortableCollectionCard
                                    key={item.id}
                                    item={item}
                                    onNavigate={onNavigate}
                                    isMenuOpen={activeMenuId === item.id}
                                    onToggleMenu={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }}
                                    onEdit={() => handleEdit(item)}
                                    onDelete={() => handleDelete(item.id)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {/* Empty & Loader */}
                {visibleCollections.length === 0 && !loading && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-slate-400">
                        <div className="bg-slate-50 p-4 rounded-full mb-3"><Search className="w-6 h-6" /></div>
                        <p>没有找到符合条件的文集</p>
                        <button onClick={() => { setFilterType('all'); setSortType('default'); }} className="mt-2 text-xs text-orange-500 hover:underline">清除筛选</button>
                    </div>
                )}

                <div className="mt-8 flex justify-center pb-8">
                    {isLoadingMore ? (
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs text-slate-600"><div className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div><span>正在加载更多...</span></div>
                    ) : hasMore ? (
                        <span className="text-xs text-slate-300">向下滚动加载更多</span>
                    ) : visibleCollections.length > 0 ? (
                        <div className="text-xs text-slate-400 font-medium bg-slate-100/50 px-4 py-1.5 rounded-full">— 已经到底了，暂无更多内容 —</div>
                    ) : null}
                </div>
            </main>
        </div>
    );
}