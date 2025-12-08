import React, { useState, useMemo, useCallback } from 'react';
import {
    ChevronDown, Filter, ArrowUpDown, Plus, Check, Search
} from 'lucide-react';
import CreateAnthologyModal, { AnthologyFormData } from '../components/AnthologyModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { SortableCollectionCard } from '../components/SortableCollectionCard'; // 引入新组件
import { useCollections } from '../hooks/useCollections'; // 引入新 Hook

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy
} from '@dnd-kit/sortable';

interface HomePageProps { onNavigate: (viewName: string, params?: any) => void; }

export default function HomePage({ onNavigate }: HomePageProps) {
    // 1. 使用 Custom Hook 接管核心逻辑
    const {
        displayCollections,
        loading,
        filterType, setFilterType,
        sortType, setSortType,
        handleDragEnd,
        addCollection,
        updateCollection,
        removeCollection
    } = useCollections();

    // 2. UI 状态
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<AnthologyFormData | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

    const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);

    // 滚动加载逻辑 (纯UI逻辑)
    const [visibleCount, setVisibleCount] = useState(12);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const visibleCollections = useMemo(() => displayCollections.slice(0, visibleCount), [displayCollections, visibleCount]);
    const hasMore = visibleCollections.length < displayCollections.length;

    // DnD 传感器
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 0 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // 滚动监听
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

    React.useEffect(() => {
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // --- UI 交互 ---
    const handleModalSubmit = async (data: AnthologyFormData) => {
        if (editingCollection) {
            await updateCollection(editingCollection.id!, data);
        } else {
            await addCollection(data);
        }
    };

    const handleConfirmDelete = async () => {
        if (deleteTargetId) {
            await removeCollection(deleteTargetId);
            setIsDeleteModalOpen(false);
            setDeleteTargetId(null);
        }
    };

    const handleEdit = (item: any) => { // 使用 any 或 Collection 类型
        setEditingCollection({
            id: item.id,
            coll_id: item.coll_id,
            title: item.title,
            description: item.description,
            iconId: item.icon_id, // 使用正确的icon_id属性
            permission: item.permission,
            isTop: item.isTop // 添加置顶状态
        });
        setIsModalOpen(true);
        setActiveMenuId(null);
    };

    return (
        <div onClick={() => { setIsFilterOpen(false); setIsSortOpen(false); setActiveMenuId(null); }}>

            {/* 文集创建/编辑弹窗 */}
            <CreateAnthologyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmit}
                initialData={editingCollection}
            />

            {/* 文集删除确认弹窗 */}
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
                {/* 过滤和排序 */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                    <div className="relative">
                        <button className="flex items-center gap-2 text-slate-700 font-semibold text-base hover:text-orange-600 transition-colors pl-2">
                            所有文集 ({displayCollections.length})
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="relative flex-grow sm:flex-grow-0">
                            <input type="text" placeholder="筛选文集..." className="pl-3 pr-8 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-full sm:w-40" />
                            <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>

                        {/* 筛选下拉框 */}
                        <div className="relative">
                            <button className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${filterType !== 'all' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`} onClick={(e) => { e.stopPropagation(); setIsFilterOpen(!isFilterOpen); setIsSortOpen(false); }}>
                                <Filter className="w-3.5 h-3.5" />
                                <span>{filterType === 'all' ? '筛选' : filterType === 'top' ? '仅置顶' : '筛选'}</span>
                            </button>
                            {isFilterOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setFilterType('all')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">全部{filterType === 'all' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setFilterType('top')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">只看置顶{filterType === 'top' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>

                        {/* 排序下拉框 */}
                        <div className="relative">
                            <button className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${sortType !== 'default' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`} onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); setIsFilterOpen(false); }}>
                                <ArrowUpDown className="w-3.5 h-3.5" />
                                <span>{sortType === 'default' ? '排序' : sortType === 'count' ? '按数量' : '按名称'}</span>
                            </button>
                            {isSortOpen && (
                                <div className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <button onClick={() => setSortType('default')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">默认排序{sortType === 'default' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('count')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按数量 (多→少){sortType === 'count' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                    <button onClick={() => setSortType('az')} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按名称 (A-Z){sortType === 'az' && <Check className="w-3 h-3 text-orange-500" />}</button>
                                </div>
                            )}
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                        <button onClick={() => { setEditingCollection(null); setIsModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95">
                            <Plus className="w-3.5 h-3.5" strokeWidth={3} /><span className="hidden sm:inline">新建文集</span><span className="sm:hidden">新建</span>
                        </button>
                    </div>
                </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={() => setActiveMenuId(null)}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={visibleCollections.map(c => c.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
                            {visibleCollections.map((item) => (
                                <SortableCollectionCard
                                    key={item.id}
                                    item={item}
                                    onNavigate={onNavigate}
                                    isMenuOpen={activeMenuId === item.id}
                                    onToggleMenu={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === item.id ? null : item.id); }}
                                    onEdit={() => handleEdit(item)}
                                    onDelete={() => {
                                        setDeleteTargetId(item.id);
                                        setIsDeleteModalOpen(true);
                                        setActiveMenuId(null);
                                    }}
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