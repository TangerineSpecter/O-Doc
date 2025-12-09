import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Hash, Search, Filter, Plus, LayoutGrid, List,
    Edit, Trash, Tag
} from 'lucide-react';
import ConfirmationModal from '../components/common/ConfirmationModal';
import TagModal, { TagFormData } from '../components/TagModal';
import { TagArticleCard } from '../components/Tag/TagArticleCard';
import { useTags } from '../hooks/useTags';
import { TagItem } from '../api/tag';

// --- 颜色主题池 ---
const COLOR_THEMES = [
    { id: 'blue', label: '科技蓝', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', dot: 'bg-blue-600' },
    { id: 'emerald', label: '翡翠绿', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', dot: 'bg-emerald-600' },
    { id: 'orange', label: '活力橙', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-100', dot: 'bg-orange-600' },
    { id: 'pink', label: '品红', bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-100', dot: 'bg-pink-600' },
    { id: 'violet', label: '紫罗兰', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-100', dot: 'bg-violet-600' },
    { id: 'cyan', label: '青色', bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-100', dot: 'bg-cyan-600' },
    { id: 'sky', label: '天空蓝', bg: 'bg-sky-50', text: 'text-sky-600', border: 'border-sky-100', dot: 'bg-sky-600' },
    { id: 'amber', label: '琥珀色', bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', dot: 'bg-amber-600' },
    { id: 'slate', label: '极简灰', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-500' },
];

export default function TagsPage() {
    const navigate = useNavigate();

    // 1. 使用 Hook
    const {
        tags,
        filteredTags,
        activeTag,
    displayArticles,
        totalArticles,
        loading,
        selectedTagId, setSelectedTagId,
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        handleTagSubmit,
        confirmDeleteTag,
        confirmDeleteArticle
    } = useTags();

    // 2. UI 状态
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<TagItem | null>(null);
    const [tagFormData, setTagFormData] = useState<TagFormData>({ name: '', themeId: 'blue' });

    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    const [isArticleDeleteModalOpen, setIsArticleDeleteModalOpen] = useState(false);
    const [articleToDelete, setArticleToDelete] = useState<string | null>(null);

    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // --- Helpers ---
    const getThemeStyles = (themeId: string | undefined) => COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES[0];

    // --- Handlers ---
    const handleOpenCreate = () => {
        setEditingTag(null);
        setTagFormData({ name: '', themeId: 'blue' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (tag: TagItem) => {
        setEditingTag(tag);
        setTagFormData({ name: tag.name, themeId: tag.themeId || 'slate' });
        setIsModalOpen(true);
    };

    const handleModalSubmitWrapper = async (data: TagFormData) => {
        const success = await handleTagSubmit(data, editingTag);
        if (success) setIsModalOpen(false);
    };

    const handleDeleteTagClick = (tagId: string) => {
        setTagToDelete(tagId);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDeleteTag = async () => {
        if (tagToDelete) {
            await confirmDeleteTag(tagToDelete);
            setIsDeleteModalOpen(false);
            setTagToDelete(null);
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
                onConfirm={handleConfirmDeleteTag}
                title="确认删除标签?"
                description={<span>确定要删除该标签吗？删除后，已关联该标签的文章将自动移除此标签关联。</span>}
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

            <TagModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmitWrapper}
                editingTag={editingTag}
                initialFormData={tagFormData}
                colorThemes={COLOR_THEMES}
            />

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        标签管理 <span className="text-indigo-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">通过标签快速筛选与定位知识库内容。</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="搜索标签..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-64 shadow-sm" />
                    </div>
                    <button onClick={handleOpenCreate} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors shadow-sm"><Plus className="w-4 h-4" /> 新建标签</button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
                {/* Left Sidebar */}
                <div className="lg:col-span-1 sticky top-[90px] h-[calc(100vh-140px)] flex flex-col gap-4">
                    {/* Stats Card */}
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden shrink-0">
                        <Hash className="absolute -right-4 -bottom-4 w-20 h-20 text-white opacity-10" />
                        <div className="relative z-10">
                            <div className="text-xs font-medium opacity-90 mb-1">标签总数</div>
                            <div className="flex items-end justify-between">
                                <div className="text-2xl font-bold leading-none">{tags.length}</div>
                                <div className="text-xs opacity-80 mb-0.5 font-mono">覆盖 {totalArticles} 篇</div>
                            </div>
                        </div>
                    </div>

                    {/* Tags List */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex-1 overflow-y-auto scrollbar-hide">
                        <div className="px-3 py-2 flex items-center justify-between">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">热门标签</h3>
                            <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{filteredTags.length}</span>
                        </div>
                        <div className="space-y-1 px-1 pb-2">
                            <button onClick={() => setSelectedTagId('all')} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${selectedTagId === 'all' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'}`}>
                                <div className="flex items-center gap-2.5"><LayoutGrid className={`w-4 h-4 ${selectedTagId === 'all' ? 'text-white' : 'text-slate-400'}`} /><span className="font-medium">全部内容</span></div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${selectedTagId === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{totalArticles}</span>
                            </button>
                            <div className="h-px bg-slate-100 my-1 mx-3"></div>
                            {filteredTags.map(tag => {
                                // 修复：使用 tagId
                                const isSelected = selectedTagId === tag.tagId;
                                const theme = getThemeStyles(tag.themeId);
                                return (
                                    // 修复：使用 tagId 作为 key 和点击参数
                                    <button key={tag.tagId} onClick={() => setSelectedTagId(tag.tagId)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all group ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-600 hover:bg-slate-50'}`}>
                                        <div className="flex items-center gap-2.5"><div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : theme.dot}`}></div><span className="font-medium">{tag.name}</span></div>
                                        {/* 修复：使用 articleCount */}
                                        <span className={`text-xs px-2 py-0.5 rounded-full transition-colors ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-white'}`}>{tag.articleCount || 0}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Content */}
                <div className="lg:col-span-3">
                    {/* List Header */}
                    <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2">
                            {selectedTagId !== 'all' && (() => {
                                const theme = getThemeStyles(activeTag?.themeId);
                                return (<span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${theme.bg} ${theme.text} ${theme.border}`}># {activeTag?.name}</span>);
                            })()}
                            <span className="text-sm text-slate-500">筛选出 <strong>{displayArticles.length}</strong> 篇文章</span>
                            {selectedTagId !== 'all' && activeTag && (
                                <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
                                    <button onClick={() => handleOpenEdit(activeTag as TagItem)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="编辑标签"><Edit className="w-3.5 h-3.5" /></button>
                                    {/* 修复：使用 tagId */}
                                    <button onClick={() => handleDeleteTagClick(activeTag.tagId)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="删除标签"><Trash className="w-3.5 h-3.5" /></button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}><List className="w-4 h-4" /></button>
                                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid className="w-4 h-4" /></button>
                            </div>
                            <div className="h-4 w-px bg-slate-200 mx-1"></div>
                            <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-indigo-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-indigo-50"><Filter className="w-3.5 h-3.5" /> 排序</button>
                        </div>
                    </div>

                    {/* Articles Grid/List */}
                    <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                        {displayArticles.map((article) => (
                            <TagArticleCard
                                key={article.articleId}
                                article={article}
                                viewMode={viewMode}
                                onNavigate={(collId, articleId) => navigate(`/article/${collId}/${articleId}`)}
                                isMenuOpen={activeMenuId === article.articleId}
                                onToggleMenu={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === article.articleId ? null : article.articleId); }}
                                onEdit={() => handleEditArticle(article.articleId)}
                                onDelete={() => handleDeleteArticleClick(article.articleId)}
                            />
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                        </div>
                    ) : displayArticles.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                            <Tag className="w-10 h-10 text-slate-300 mb-3" />
                            <p className="text-sm font-medium">该标签下暂无文章</p>
                        </div>
                    )}
                </div>

                <style>{`
                    .scrollbar-hide::-webkit-scrollbar { display: none; }
                    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
                `}</style>
            </div>
        </div>
    );
}