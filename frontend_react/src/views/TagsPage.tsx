import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. 引入 useNavigate
import {
    Tag, Hash, Search, FileText, Clock, ChevronRight,
    Filter, BookOpen, Plus, MoreHorizontal, LayoutGrid, List,
    Edit, Trash, X, Save
} from 'lucide-react';
import ConfirmationModal from '../components/common/ConfirmationModal'; // 2. 引入 ConfirmationModal
import { 
    getTagList, 
    createTag, 
    updateTag, 
    deleteTag, 
    getArticlesByTag,
    TagItem,
    ArticleItem
} from '../api/tag';

// --- 接口定义 ---
interface TagFormData {
    name: string;
    themeId: string;
}

interface ColorTheme {
    id: string;
    label: string;
    bg: string;
    text: string;
    border: string;
    dot: string;
}

// --- 颜色主题池 ---
const COLOR_THEMES: ColorTheme[] = [
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
    const navigate = useNavigate(); // 3. Hook
    const [tags, setTags] = useState<TagItem[]>([]);
    const [selectedTagId, setSelectedTagId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('list');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTag, setEditingTag] = useState<TagItem | null>(null);
    const [formData, setFormData] = useState<TagFormData>({ name: '', themeId: 'blue' });

    // Delete Tag Modal
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [tagToDelete, setTagToDelete] = useState<string | null>(null);

    // --- 4. 新增：Article Actions State ---
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());
    const [isArticleDeleteModalOpen, setIsArticleDeleteModalOpen] = useState(false);
    const [articleToDelete, setArticleToDelete] = useState<string | null>(null);

    // --- API 状态 ---
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);

    // 获取标签列表
    const fetchTags = async () => {
        try {
            const data = await getTagList();
            setTags(data);
        } catch (error) {
            console.error('获取标签列表失败:', error);
        }
    };

    // 根据标签获取文章
    const fetchArticles = async (tagId: string) => {
        try {
            setLoading(true);
            const data = await getArticlesByTag(tagId);
            setDisplayArticles(data);
        } catch (error) {
            console.error('获取文章失败:', error);
            setDisplayArticles([]);
        } finally {
            setLoading(false);
        }
    };

    // 初始化数据
    useEffect(() => {
        fetchTags();
    }, []);

    

    // 标签变化时获取对应文章
    useEffect(() => {
        if (selectedTagId && selectedTagId !== 'all') {
            fetchArticles(selectedTagId);
        } else if (selectedTagId === 'all') {
            // 全部标签时，调用API获取默认文章数据
            getArticlesByTag(selectedTagId)
                .then(articles => {
                    setLoading(false);
                    setDisplayArticles(articles);
                })
                .catch(error => {
                    console.error("获取全部文章失败:", error);
                    setLoading(false);
                    setDisplayArticles([]);
                });
        }
    }, [selectedTagId, tags]);

    // --- Tag Actions (保持不变) ---
    const handleOpenCreate = () => {
        setEditingTag(null);
        setFormData({ name: '', themeId: 'blue' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (tag: TagItem) => {
        setEditingTag(tag);
        setFormData({ name: tag.name, themeId: tag.themeId || 'slate' });
        setIsModalOpen(true);
    };

    const handleDeleteTag = (tagId: string) => {
        setTagToDelete(tagId);
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteTag = async () => {
        if (tagToDelete) {
            try {
                await deleteTag(tagToDelete);
                setTags(prev => prev.filter(t => t.id !== tagToDelete));
                if (selectedTagId === tagToDelete) {
                    setSelectedTagId('all');
                    setDisplayArticles([]);
                }
            } catch (error) {
                console.error('删除标签失败:', error);
            }
        }
        setIsDeleteModalOpen(false);
        setTagToDelete(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        try {
            if (editingTag) {
                // 更新标签
                const updatedTag = await updateTag(editingTag.id, formData);
                setTags(prev => prev.map(t => t.id === editingTag.id ? updatedTag : t));
            } else {
                // 创建标签
                const newTag = await createTag(formData);
                setTags(prev => [...prev, newTag]);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error('操作标签失败:', error);
        }
    };

    // --- 5. 新增：Article Actions ---
    const handleMenuClick = (e: React.MouseEvent, articleId: string) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === articleId ? null : articleId);
    };

    const handleEditArticle = (articleId: string) => {
        navigate(`/editor/${articleId}`);
        setActiveMenuId(null);
    };

    const handleDeleteArticleClick = (articleId: string) => {
        setArticleToDelete(articleId);
        setIsArticleDeleteModalOpen(true);
        setActiveMenuId(null);
    };

    const confirmDeleteArticle = () => {
        if (articleToDelete) {
            setDeletedArticleIds(prev => new Set(prev).add(articleToDelete));
        }
        setIsArticleDeleteModalOpen(false);
        setArticleToDelete(null);
    };

    // --- Helpers ---
    const getThemeStyles = (themeId: string | undefined): ColorTheme => COLOR_THEMES.find((t: ColorTheme) => t.id === themeId) || COLOR_THEMES[0];

    // --- Derived State ---
    const filteredTags = useMemo(() => {
        if (!searchQuery) return tags;
        return tags.filter(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, tags]);

    // 过滤已删除的文章
    const filteredDisplayArticles = useMemo(() => {
        return displayArticles.filter(art => !deletedArticleIds.has(art.id));
    }, [displayArticles, deletedArticleIds]);

    const totalArticles = tags.reduce((acc, cur) => acc + cur.count, 0);
    // 确保 activeTag 始终有值，避免 undefined 错误
    const activeTag = tags.find(t => t.id === selectedTagId) || {
        id: 'all',
        name: '所有标签',
        description: '所有标签下的文章',
        count: totalArticles,
        isSystem: true,
        themeId: 'blue'
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24" onClick={() => setActiveMenuId(null)}>

            {/* Tag Delete Modal */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDeleteTag}
                title="确认删除标签?"
                description={<span>确定要删除该标签吗？删除后，已关联该标签的文章将自动移除此标签关联。</span>}
                confirmText="确认删除"
                type="danger"
            />

            {/* 7. Article Delete Modal */}
            <ConfirmationModal
                isOpen={isArticleDeleteModalOpen}
                onClose={() => setIsArticleDeleteModalOpen(false)}
                onConfirm={confirmDeleteArticle}
                title="确认删除文章?"
                description="确定要删除这篇文章吗？此操作无法恢复。"
                confirmText="删除"
                type="danger"
            />

            {/* Create/Edit Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-bold text-slate-800">
                                {editingTag ? '编辑标签' : '新建标签'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* ... (表单保持不变) ... */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">标签名称 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                                    placeholder="例如：React"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">颜色主题</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_THEMES.map((theme: ColorTheme) => (
                                        <button
                                            key={theme.id}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, themeId: theme.id })}
                                            className={`
                                                flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all
                                                ${formData.themeId === theme.id
                                                    ? `${theme.bg} ${theme.text} ${theme.border} ring-1 ring-offset-1 ring-${theme.text.split('-')[1]}-500`
                                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}
                                            `}
                                        >
                                            <div className={`w-2 h-2 rounded-full ${theme.dot}`}></div>
                                            {theme.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">取消</button>
                                <button type="submit" disabled={!formData.name.trim()} className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"><Save className="w-4 h-4" />{editingTag ? '保存修改' : '立即创建'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Header ... (保持不变) ... */}
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
                {/* Left Sidebar (保持不变) ... */}
                <div className="lg:col-span-1 sticky top-[90px] h-[calc(100vh-140px)] flex flex-col gap-4">
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
                                const isSelected = selectedTagId === tag.id;
                                const theme = getThemeStyles(tag.themeId);
                                return (
                                    <button key={tag.id} onClick={() => setSelectedTagId(tag.id)} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all group ${isSelected ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20' : 'text-slate-600 hover:bg-slate-50'}`}>
                                        <div className="flex items-center gap-2.5"><div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : theme.dot}`}></div><span className="font-medium">{tag.name}</span></div>
                                        <span className={`text-xs px-2 py-0.5 rounded-full transition-colors ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-white'}`}>{tag.count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Content */}
                <div className="lg:col-span-3">
                    {/* List Header (保持不变) ... */}
                    <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                        <div className="flex items-center gap-2">
                            {selectedTagId !== 'all' && (() => {
                                const theme = getThemeStyles(activeTag?.themeId);
                                return (<span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${theme.bg} ${theme.text} ${theme.border}`}># {activeTag?.name}</span>);
                            })()}
                            <span className="text-sm text-slate-500">筛选出 <strong>{displayArticles.length}</strong> 篇文章</span>
                            {selectedTagId !== 'all' && activeTag && (
                                <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
                                    <button onClick={() => handleOpenEdit(activeTag)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="编辑标签"><Edit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteTag(activeTag.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="删除标签"><Trash className="w-3.5 h-3.5" /></button>
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
                        {filteredDisplayArticles.map((article) => (
                            <div key={article.id}
                                onClick={() => navigate(`/article/${article.collId || 'col_default'}/${article.id}`)}
                                className="group bg-white rounded-2xl p-5 border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all duration-300 cursor-pointer relative overflow-visible">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"><FileText className="w-4 h-4" /></div>
                                        <span className="text-xs text-slate-400">{article.date}</span>
                                    </div>

                                    <div className="relative">
                                        <button
                                            onClick={(e) => handleMenuClick(e, article.id)}
                                            className="text-slate-300 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100"
                                        >
                                            <MoreHorizontal className="w-4 h-4" />
                                        </button>

                                        {/* 8. 下拉菜单 */}
                                        {activeMenuId === article.id && (
                                            <div className="absolute right-0 top-full mt-1 w-24 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleEditArticle(article.id); }}
                                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                                >
                                                    <Edit className="w-3 h-3" /> 编辑
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteArticleClick(article.id); }}
                                                    className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                >
                                                    <Trash className="w-3 h-3" /> 删除
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors">{article.title}</h3>
                                <p className="text-sm text-slate-500 line-clamp-2 mb-4 leading-relaxed">{article.desc}</p>

                                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                                    <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {article.readTime} 分钟阅读</span>
                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 rounded-md border border-orange-100 text-orange-600 text-[10px] font-medium"><BookOpen className="w-3 h-3" /> {article.collection}</span>
                                    </div>
                                    <span className="text-xs font-bold text-indigo-600 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all flex items-center gap-1">阅读全文 <ChevronRight className="w-3 h-3" /></span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                        </div>
                    ) : filteredDisplayArticles.length === 0 && (
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