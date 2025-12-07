import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
    ChevronDown, FileText, Filter, ArrowUpDown, ArrowUp, Lock,
    Plus, Check, Search, GripHorizontal, MoreHorizontal, Edit, Trash
} from 'lucide-react';
import { createAnthology, CreateAnthologyParams, getAnthologyList, sortAnthology, Anthology } from '../api/anthology';
import homepageDemoData from '../data/homepageDemoData.json';
import { useToast } from '../components/ToastProvider';
import { AVAILABLE_ICONS, getIconComponent } from '../constants/iconList';
import CreateAnthologyModal, { AnthologyFormData } from '../components/CreateAnthologyModal';
import ConfirmationModal from '../components/ConfirmationModal'; // 1. 引入新组件

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

// ... (接口定义和模拟数据部分保持不变) ...
interface ArticleSummary { article_id: string; title: string; date: string; }
interface Collection extends Anthology { icon: React.ReactNode; }
interface HomePageProps { onNavigate: (viewName: string, params?: any) => void; }

// ... (SortableCollectionCard 组件保持不变) ...
// 这里的 SortableCollectionCard 代码不需要变，因为它的 handle 是 z-30
// 我们只需要在下方提升 dropdown 的 z-index 即可

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

            <div className="absolute top-2 right-2 z-20">
                <button
                    onClick={onToggleMenu}
                    className={`p-1.5 rounded-md transition-colors ${isMenuOpen ? 'bg-orange-50 text-orange-600' : 'text-slate-300 hover:bg-slate-50 hover:text-slate-600 opacity-0 group-hover:opacity-100'}`}
                >
                    <MoreHorizontal className="w-4 h-4" />
                </button>

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

            <div className="p-3 pb-2 pt-6">
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
                                <span className="text-xs text-slate-300 font-mono whitespace-nowrap pl-2">{article.date}</span>
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
    // ... (State definitions) ...
    const [collections, setCollections] = useState<Collection[]>([]);
    const toast = useToast();
    const [loading, setLoading] = useState(false);
    
    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<AnthologyFormData | null>(null);
    
    // 2. 新增：删除确认框状态
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

    const [activeMenuId, setActiveMenuId] = useState<number | null>(null);

    // ... (Dnd Sensors & fetchCollections 保持不变) ...
    // Dnd Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 0 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchCollections = async () => {
        setLoading(true);
        try {
            let data: Anthology[];
            // 简单处理：判断环境
            if (import.meta.env.MODE === 'development') {
                data = homepageDemoData as Anthology[];
            } else {
                data = await getAnthologyList();
            }
            
            const processedData: Collection[] = data.map((anthology: Anthology) => ({
                ...anthology,
                articles: anthology.articles || [],
                count: anthology.count || 0,
                icon: getIconComponent(anthology.iconId)
            }));
            
            processedData.sort((a: Collection, b: Collection) => (a.sort || 0) - (b.sort || 0));
            setCollections(processedData);
        } catch (error) {
            console.error('获取列表失败', error);
            // setCollections(initialCollectionsData); // 这里需要您保证 initialCollectionsData 存在，或者移除
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

    // ... (Drag Handlers & Scroll Handler 保持不变) ...
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

        const draggedItem = newCollections[newIndex];
        const pinnedCount = collections.filter(c => c.isTop).length;
        let newSortOrder = newIndex - pinnedCount + 1;
        if (newSortOrder < 1) newSortOrder = 1;

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
    const handleModalSubmit = async (data: AnthologyFormData) => {
        if (editingCollection) {
            setCollections(prev => prev.map(c => {
                if (c.id === editingCollection.id) {
                    return {
                        ...c,
                        title: data.title,
                        description: data.description,
                        iconId: data.iconId,
                        permission: data.permission,
                        icon: getIconComponent(data.iconId)
                    };
                }
                return c;
            }));
            toast.success("文集已更新 (前端演示)");
        } else {
            const params: CreateAnthologyParams = {
                title: data.title,
                description: data.description,
                iconId: data.iconId,
                permission: data.permission,
                sort: collections.length + 1
            };
            const response = await createAnthology(params);
            const newItem: Collection = {
                ...response,
                articles: [],
                count: 0,
                isTop: false,
                icon: getIconComponent(response.iconId)
            };
            setCollections((prev) => {
                const pinned = prev.filter(c => c.isTop);
                const unpinned = prev.filter(c => !c.isTop);
                return [...pinned, newItem, ...unpinned];
            });
            toast.success("文集创建成功！");
        }
    };

    // 3. 触发删除确认
    const handleClickDelete = (id: number) => {
        setDeleteTargetId(id);
        setIsDeleteModalOpen(true);
        setActiveMenuId(null);
    };

    // 4. 执行删除
    const handleConfirmDelete = () => {
        if (deleteTargetId) {
            setCollections(prev => prev.filter(c => c.id !== deleteTargetId));
            toast.success('文集已删除');
            setIsDeleteModalOpen(false);
            setDeleteTargetId(null);
        }
    };

    const handleEdit = (item: Collection) => {
        setEditingCollection({
            id: item.id,
            coll_id: item.coll_id,
            title: item.title,
            description: item.description,
            iconId: item.iconId,
            permission: item.permission
        });
        setIsModalOpen(true);
        setActiveMenuId(null);
    };

    const handleCreateClick = () => {
        setEditingCollection(null);
        setIsModalOpen(true);
    }

    return (
        <div onClick={() => { setIsFilterOpen(false); setIsSortOpen(false); setActiveMenuId(null); }}>

            {/* Anthology Create/Edit Modal */}
            <CreateAnthologyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmit}
                initialData={editingCollection}
            />

            {/* 5. Delete Confirmation Modal */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="确认删除文集?"
                description={
                    <span>
                        确定要删除该文集吗？此操作<strong className="text-red-600">无法恢复</strong>，且该文集下的所有文章也将被一并移除。
                    </span>
                }
                confirmText="确认删除"
                type="danger"
            />

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
                            {/* 6. Fix Z-Index: 提升到 z-50 */}
                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                            {/* 7. Fix Z-Index: 提升到 z-50 */}
                            {isSortOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setSortType('default')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">默认排序{sortType === 'default' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('count')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按数量 (多→少){sortType === 'count' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('az')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按名称 (A-Z){sortType === 'az' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                        <button onClick={handleCreateClick} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95">
                            <Plus className="w-3.5 h-3.5" strokeWidth={3} /><span className="hidden sm:inline">新建文集</span><span className="sm:hidden">新建</span>
                        </button>
                    </div>
                </div>

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
                                    onDelete={() => handleClickDelete(item.id)}
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