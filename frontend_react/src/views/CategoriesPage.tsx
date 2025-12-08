import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Folder, Search, Plus, LayoutGrid, List, Layers,
    Server, PenTool, Globe, Users, Database, Box, Edit, Trash, Inbox
} from 'lucide-react';
import ConfirmationModal from '../components/common/ConfirmationModal';
import CategoryModal, { CategoryFormData } from '../components/CategoryModal';
import { CategoryArticleCard } from '../components/Category/CategoryArticleCard';
import { useCategories } from '../hooks/useCategories';
import { CategoryItem } from '../api/category';

// --- 图标与主题配置 ---
const ICON_MAP: Record<string, React.ReactElement<{ className?: string }>> = {
    Layers: <Layers className="w-5 h-5" />,
    Server: <Server className="w-5 h-5" />,
    Database: <Database className="w-5 h-5" />,
    PenTool: <PenTool className="w-5 h-5" />,
    Globe: <Globe className="w-5 h-5" />,
    Users: <Users className="w-5 h-5" />,
    Box: <Box className="w-5 h-5" />,
    Folder: <Folder className="w-5 h-5" />,
};

const COLOR_THEMES = [
    { id: 'blue', label: '科技蓝', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-600' },
    { id: 'emerald', label: '翡翠绿', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-600' },
    { id: 'orange', label: '活力橙', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', dot: 'bg-orange-600' },
    { id: 'pink', label: '品红', bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', dot: 'bg-pink-600' },
    { id: 'violet', label: '紫罗兰', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', dot: 'bg-violet-600' },
    { id: 'cyan', label: '青色', bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', dot: 'bg-cyan-600' },
    { id: 'slate', label: '极简灰', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-500' },
];

export default function CategoriesPage() {
    const navigate = useNavigate();

    // 1. 使用 Hook
    const {
        filteredCategories,
        activeCategory,
        displayArticles,
        loading,
        selectedCatId, setSelectedCatId,
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        handleCategorySubmit,
        confirmDeleteCategory,
        confirmDeleteArticle
    } = useCategories();

    // 2. UI 状态 (模态框、菜单)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
    const [categoryFormData, setCategoryFormData] = useState<CategoryFormData>({ name: '', description: '', themeId: 'blue', iconKey: 'Folder' });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

    const [isArticleDeleteModalOpen, setIsArticleDeleteModalOpen] = useState(false);
    const [articleToDelete, setArticleToDelete] = useState<string | null>(null);

    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // --- Helpers ---
    const getThemeStyles = (themeId: string) => COLOR_THEMES.find(t => t.id === themeId) || COLOR_THEMES[0];
    const getCategoryIcon = (cat: CategoryItem) => {
        if (cat.id === 'uncategorized') return <Inbox className="w-5 h-5" />;
        return ICON_MAP[cat.iconKey] || <Folder className="w-5 h-5" />;
    };

    // --- Handlers ---
    const handleOpenCreate = () => {
        setEditingCategory(null);
        setCategoryFormData({ name: '', description: '', themeId: 'blue', iconKey: 'Folder' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (category: CategoryItem) => {
        setEditingCategory(category);
        setCategoryFormData({
            name: category.name,
            description: category.description,
            themeId: category.themeId,
            iconKey: category.iconKey
        });
        setIsModalOpen(true);
    };

    const handleModalSubmitWrapper = async (data: CategoryFormData) => {
        const success = await handleCategorySubmit(data, editingCategory);
        if (success) setIsModalOpen(false);
    };

    const handleDeleteCategoryClick = (catId: string) => {
        setCategoryToDelete(catId);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDeleteCategory = async () => {
        if (categoryToDelete) {
            await confirmDeleteCategory(categoryToDelete);
            setIsDeleteModalOpen(false);
            setCategoryToDelete(null);
        }
    };

    const handleDeleteArticleClick = (articleId: string) => {
        setArticleToDelete(articleId);
        setIsArticleDeleteModalOpen(true);
        setActiveMenuId(null);
    };

    const handleConfirmDeleteArticle = () => {
        if (articleToDelete) {
            confirmDeleteArticle(articleToDelete);
            setIsArticleDeleteModalOpen(false);
            setArticleToDelete(null);
        }
    };

    const handleEditArticle = (articleId: string) => {
        navigate(`/editor/${articleId}`);
        setActiveMenuId(null);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24" onClick={() => setActiveMenuId(null)}>

            {/* Modals */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDeleteCategory}
                title="确认删除分类?"
                description={<span>确定要删除该分类吗？删除后，该分类下的文章将自动归入 <span className="font-bold text-slate-800">未分类</span> 状态。</span>}
                confirmText="确认删除"
                type="danger"
            />

            <ConfirmationModal
                isOpen={isArticleDeleteModalOpen}
                onClose={() => setIsArticleDeleteModalOpen(false)}
                onConfirm={handleConfirmDeleteArticle}
                title="确认删除文章?"
                description="确定要删除这篇文章吗？此操作无法恢复。"
                confirmText="删除"
                type="danger"
            />

            <CategoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmitWrapper}
                editingCategory={editingCategory}
                initialFormData={categoryFormData}
                iconMap={ICON_MAP}
                colorThemes={COLOR_THEMES}
            />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        分类管理 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">构建结构化的知识体系，让文档井井有条。</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="搜索分类..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all w-64 shadow-sm" />
                    </div>
                    <button onClick={handleOpenCreate} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors shadow-sm"><Plus className="w-4 h-4" /> 新建分类</button>
                </div>
            </div>

            {/* Category Strip */}
            <div className="sticky top-[64px] z-30 bg-[#F9FAFB]/95 backdrop-blur-md -mx-4 px-4 sm:mx-0 sm:px-0 py-2 mb-6 border-b border-slate-200/50 transition-all">
                <div className="flex gap-3 overflow-x-auto scrollbar-hide py-1">
                    {filteredCategories.map((cat) => {
                        const isSelected = selectedCatId === cat.id;
                        const theme = getThemeStyles(cat.themeId);
                        return (
                            <button key={cat.id} onClick={() => setSelectedCatId(cat.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 flex-shrink-0 ${isSelected ? 'bg-white border-orange-500 ring-1 ring-orange-500/20 shadow-md' : 'bg-white border-slate-200 hover:border-orange-200 hover:shadow-sm'}`}>
                                <div className={`p-1 rounded-md transition-colors ${isSelected ? 'bg-orange-100 text-orange-600' : `${theme.bg} ${theme.text}`}`}>{getCategoryIcon(cat)}</div>
                                <div className="flex flex-col items-start"><span className={`text-xs font-bold whitespace-nowrap ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>{cat.name}</span></div>
                                {isSelected && <span className="ml-1 text-[10px] bg-orange-100 text-orange-600 px-1.5 rounded-full font-medium">{cat.count}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Content List */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[500px]">
                {/* List Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${getThemeStyles(activeCategory.themeId).bg} ${getThemeStyles(activeCategory.themeId).text}`}>{getCategoryIcon(activeCategory)}</div>
                            <h2 className="text-lg font-bold text-slate-800">{activeCategory.name}</h2>
                            {!activeCategory.isSystem && (
                                <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
                                    <button onClick={() => handleOpenEdit(activeCategory)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="编辑分类"><Edit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteCategoryClick(activeCategory.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="删除分类"><Trash className="w-3.5 h-3.5" /></button>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-2 max-w-2xl leading-relaxed">{activeCategory.description || "暂无描述"}</p>
                    </div>
                    <div className="flex items-center gap-3 self-end">
                        <span className="text-xs text-slate-400 font-medium hidden sm:inline-block">共 {displayArticles.length} 篇</span>
                        <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List className="w-4 h-4" /></button>
                            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid className="w-4 h-4" /></button>
                        </div>
                    </div>
                </div>

                {/* Articles Rendering */}
                <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" : "flex flex-col gap-3"}>
                    {displayArticles.map((article) => (
                        <CategoryArticleCard
                            key={article.id}
                            article={article}
                            viewMode={viewMode}
                            onNavigate={(collId, articleId) => navigate(`/article/${collId}/${articleId}`)}
                            isMenuOpen={activeMenuId === article.id}
                            onToggleMenu={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === article.id ? null : article.id); }}
                            onEdit={() => handleEditArticle(article.id)}
                            onDelete={() => handleDeleteArticleClick(article.id)}
                        />
                    ))}
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-24">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                    </div>
                ) : displayArticles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                        <Folder className="w-12 h-12 text-slate-200 mb-3" />
                        <p className="text-sm font-medium">该分类下暂无文档</p>
                        <button onClick={handleOpenCreate} className="mt-4 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs rounded-lg hover:border-orange-300 hover:text-orange-600 transition-colors shadow-sm">创建新文档</button>
                    </div>
                )}
            </div>

            <style>{`
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}