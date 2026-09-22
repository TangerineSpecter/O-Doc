import React, { useCallback, useMemo, useState } from 'react';
import { ArrowUpDown, Check, ChevronDown, Filter, Plus, Search } from 'lucide-react';
import CreateAnthologyModal, { AnthologyFormData } from '../components/AnthologyModal';
import ConfirmationModal from '../components/common/ConfirmationModal';
import { SortableCollectionCard } from '../components/SortableCollectionCard'; // 引入新组件
import { useCollections } from '../hooks/useCollections'; // 引入新 Hook
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useAuth } from '../contexts/AuthContext';
import HomeStatusBar from '../components/Home/HomeStatusBar';

interface HomePageProps {
    onNavigate: (viewName: string, params?: any) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
    const { isAuthenticated } = useAuth();

    // 1. 使用 Custom Hook 接管核心逻辑
    const {
        displayCollections,
        loading,
        filterType, setFilterType,
        sortType, setSortType,
        handleDragEnd,
        addCollection,
        updateCollection,
        removeCollection,
        refresh: fetchCollections
    } = useCollections();

    // 2. UI 状态
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<AnthologyFormData | null>(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);

    // Filter by type (Header dropdown)
    const [isTypeFilterOpen, setIsTypeFilterOpen] = useState(false);
    const [selectedType, setSelectedType] = useState<'all' | 'article' | 'image' | 'agent' | 'book'>('all');

    const handleTypeSelect = (type: 'all' | 'article' | 'image' | 'agent' | 'book') => {
        setSelectedType(type);
        fetchCollections(type === 'all' ? undefined : type);
        setIsTypeFilterOpen(false);
    };

    // 搜索过滤与滚动加载逻辑
    const [searchKeyword, setSearchKeyword] = useState('');
    const [visibleCount, setVisibleCount] = useState(12);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const filteredDisplayCollections = useMemo(() => {
        const keyword = searchKeyword.trim().toLowerCase();
        if (!keyword) return displayCollections;
        return displayCollections.filter(c =>
            c.title?.toLowerCase().includes(keyword) ||
            c.description?.toLowerCase().includes(keyword)
        );
    }, [displayCollections, searchKeyword]);

    const visibleCollections = useMemo(() => filteredDisplayCollections.slice(0, visibleCount), [filteredDisplayCollections, visibleCount]);
    const hasMore = visibleCollections.length < filteredDisplayCollections.length;

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
        if (!isAuthenticated) return;
        if (editingCollection) {
            await updateCollection(editingCollection.collId!, data);
        } else {
            await addCollection(data);
        }
    };

    const handleConfirmDelete = async () => {
        if (!isAuthenticated) return;
        if (deleteTargetId) {
            await removeCollection(deleteTargetId);
            setIsDeleteModalOpen(false);
            setDeleteTargetId(null);
        }
    };

    const handleEdit = (item: any) => { // 使用 any 或 Collection 类型
        if (!isAuthenticated) return;
        setEditingCollection(item);
        setIsModalOpen(true);
        setActiveMenuId(null);
    };

    return (
        <div onClick={() => {
            setIsFilterOpen(false);
            setIsSortOpen(false);
            setIsTypeFilterOpen(false);
            setActiveMenuId(null);
        }}>

            {/* 文集创建/编辑弹窗 */}
            {isAuthenticated && (
                <CreateAnthologyModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSubmit={handleModalSubmit}
                    initialData={editingCollection}
                />
            )}

            {/* 文集删除确认弹窗 */}
            {isAuthenticated && (
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
            )}

            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {isAuthenticated && <HomeStatusBar onNavigate={onNavigate} />}
                <div className="min-w-0">
                        {/* 过滤和排序 */}
                        <div
                            className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 mb-6 bg-white p-3 rounded-xl shadow-sm border border-slate-100">
                            {/* 首行（移动端左右分布：左为文集分类选择，右为新建按钮；桌面端居左） */}
                            <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto">
                                <div className="relative">
                                    <button
                                        className="flex items-center gap-2 text-slate-700 font-semibold text-base hover:text-orange-600 transition-colors pl-2"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsTypeFilterOpen(!isTypeFilterOpen);
                                            setIsSortOpen(false);
                                            setIsFilterOpen(false);
                                        }}
                                    >
                                        {selectedType === 'all' ? '所有文集' : selectedType === 'article' ? '文章文集' : selectedType === 'image' ? '图片文集' : selectedType === 'book' ? '图书文集' : 'Agent'} ({filteredDisplayCollections.length})
                                        <ChevronDown className={`w-4 h-4 transition-transform ${isTypeFilterOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isTypeFilterOpen && (
                                        <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                            <button onClick={() => handleTypeSelect('all')}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex justify-between items-center text-slate-700">
                                                所有文集
                                                {selectedType === 'all' && <Check className="w-4 h-4 text-orange-500" />}
                                            </button>
                                            <button onClick={() => handleTypeSelect('article')}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex justify-between items-center text-slate-700">
                                                文章文集
                                                {selectedType === 'article' && <Check className="w-4 h-4 text-orange-500" />}
                                            </button>
                                            <button onClick={() => handleTypeSelect('image')}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex justify-between items-center text-slate-700">
                                                图片文集
                                                {selectedType === 'image' && <Check className="w-4 h-4 text-orange-500" />}
                                            </button>
                                            <button onClick={() => handleTypeSelect('book')} className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex justify-between items-center text-slate-700">图书文集{selectedType === 'book' && <Check className="w-4 h-4 text-orange-500" />}</button>
                                            <button onClick={() => handleTypeSelect('agent')}
                                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 flex justify-between items-center text-slate-700">
                                                Agent
                                                {selectedType === 'agent' && <Check className="w-4 h-4 text-orange-500" />}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* 移动端首行右侧：新建按钮（解决移动端按钮换行孤立问题） */}
                                {isAuthenticated && (
                                    <button onClick={() => {
                                        setEditingCollection(null);
                                        setIsModalOpen(true);
                                    }}
                                        className="sm:hidden flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95">
                                        <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                        <span>新建</span>
                                    </button>
                                )}
                            </div>

                            {/* 次行（移动端搜索 + 筛选 + 排序；桌面端整行排列并在末尾提供新建文集按钮） */}
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="relative flex-1 sm:w-40 sm:flex-initial">
                                    <input
                                        type="text"
                                        placeholder="筛选文集..."
                                        value={searchKeyword}
                                        onChange={(e) => setSearchKeyword(e.target.value)}
                                        className="pl-3 pr-8 py-1 bg-slate-50 border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 w-full"
                                    />
                                    <Search className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
                                </div>
                                <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>

                                {/* 筛选下拉框 */}
                                <div className="relative">
                                    <button
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${filterType !== 'all' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsFilterOpen(!isFilterOpen);
                                            setIsSortOpen(false);
                                        }}>
                                        <Filter className="w-3.5 h-3.5" />
                                        <span>{filterType === 'all' ? '筛选' : filterType === 'top' ? '仅置顶' : '筛选'}</span>
                                    </button>
                                    {isFilterOpen && (
                                        <div
                                            className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                            <button onClick={() => setFilterType('all')}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">全部{filterType === 'all' &&
                                                    <Check className="w-3 h-3 text-orange-500" />}</button>
                                            <button onClick={() => setFilterType('top')}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">只看置顶{filterType === 'top' &&
                                                    <Check className="w-3 h-3 text-orange-500" />}</button>
                                        </div>
                                    )}
                                </div>

                                {/* 排序下拉框 */}
                                <div className="relative">
                                    <button
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors ${sortType !== 'default' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'text-slate-600 hover:bg-slate-100'}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsSortOpen(!isSortOpen);
                                            setIsFilterOpen(false);
                                        }}>
                                        <ArrowUpDown className="w-3.5 h-3.5" />
                                        <span>{sortType === 'default' ? '排序' : sortType === 'count' ? '按数量' : '按名称'}</span>
                                    </button>
                                    {isSortOpen && (
                                        <div
                                            className="absolute right-0 top-full mt-2 w-32 bg-white rounded-lg shadow-xl border border-slate-100 z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                            <button onClick={() => setSortType('default')}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">默认排序{sortType === 'default' &&
                                                    <Check className="w-3 h-3 text-orange-500" />}</button>
                                            <button onClick={() => setSortType('count')}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按数量
                                                (多→少){sortType === 'count' &&
                                                    <Check className="w-3 h-3 text-orange-500" />}</button>
                                            <button onClick={() => setSortType('az')}
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex justify-between items-center">按名称
                                                (A-Z){sortType === 'az' &&
                                                    <Check className="w-3 h-3 text-orange-500" />}</button>
                                        </div>
                                    )}
                                </div>

                                {/* 桌面端新建按钮 */}
                                {isAuthenticated && (
                                    <>
                                        <div className="h-5 w-px bg-slate-200 hidden sm:block mx-1"></div>
                                        <button onClick={() => {
                                            setEditingCollection(null);
                                            setIsModalOpen(true);
                                        }}
                                            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-xs font-medium transition-all shadow-sm shadow-orange-500/20 active:scale-95">
                                            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                            <span>新建文集</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={visibleCollections.map(c => c.collId)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-20">
                            {visibleCollections.map((item) => (
                                <SortableCollectionCard
                                    key={item.collId}
                                    item={item}
                                    onNavigate={onNavigate}
                                    isMenuOpen={activeMenuId === item.collId}
                                    canManage={isAuthenticated}
                                    onToggleMenu={(e) => {
                                        e.stopPropagation();
                                        setActiveMenuId(activeMenuId === item.collId ? null : item.collId);
                                    }}
                                    onEdit={() => handleEdit(item)}
                                    onDelete={() => {
                                        if (!isAuthenticated) return;
                                        setDeleteTargetId(item.collId);
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
                        <button onClick={() => {
                            setSearchKeyword('');
                            setFilterType('all');
                            setSortType('default');
                        }} className="mt-2 text-xs text-orange-500 hover:underline">清除筛选
                        </button>
                    </div>
                )}

                        <div className="mt-8 flex justify-center pb-8">
                    {isLoadingMore ? (
                        <div
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-full shadow-sm text-xs text-slate-600">
                            <div
                                className="w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                            <span>正在加载更多...</span></div>
                    ) : hasMore ? (
                        <span className="text-xs text-slate-300">向下滚动加载更多</span>
                    ) : visibleCollections.length > 0 ? (
                        <div className="text-xs text-slate-400 font-medium bg-slate-100/50 px-4 py-1.5 rounded-full">—
                            已经到底了，暂无更多内容 —</div>
                    ) : null}
                        </div>
                    </div>
            </main>
        </div>
    );
}
