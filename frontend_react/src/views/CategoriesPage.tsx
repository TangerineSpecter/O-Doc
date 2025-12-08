import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // 1. 引入路由
import {
    Folder, FolderOpen, Search, FileText, Clock,
    Plus, MoreHorizontal, LayoutGrid, List, Layers,
    Server, PenTool, Globe, Users, Database, Box, Edit, Trash,
    Inbox
} from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal'; // 2. 引入通用确认框
import CategoryModal from '../components/CategoryModal'; // 引入分类模态框组件
import { 
    getCategoryList, 
    createCategory, 
    updateCategory, 
    deleteCategory, 
    getArticlesByCategory,
    CategoryItem,
    ArticleItem
} from '../api/category';

interface CategoryFormData {
    name: string;
    description: string;
    themeId: string;
    iconKey: string;
}

// --- 1. 图标映射池 ---
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

// --- 2. 颜色主题池 ---
const COLOR_THEMES = [
    { id: 'blue', label: '科技蓝', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-600' },
    { id: 'emerald', label: '翡翠绿', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-600' },
    { id: 'orange', label: '活力橙', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', dot: 'bg-orange-600' },
    { id: 'pink', label: '品红', bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', dot: 'bg-pink-600' },
    { id: 'violet', label: '紫罗兰', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', dot: 'bg-violet-600' },
    { id: 'cyan', label: '青色', bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', dot: 'bg-cyan-600' },
    { id: 'slate', label: '极简灰', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-500' },
];


const getTagStyle = (tag: string) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) { hash = tag.charCodeAt(i) + ((hash << 5) - hash); }
    const palettes = [
        'bg-blue-50 text-blue-700 border-blue-100',
        'bg-emerald-50 text-emerald-700 border-emerald-100',
        'bg-violet-50 text-violet-700 border-violet-100',
        'bg-orange-50 text-orange-700 border-orange-100',
        'bg-rose-50 text-rose-700 border-rose-100',
        'bg-cyan-50 text-cyan-700 border-cyan-100',
    ];
    return palettes[Math.abs(hash) % palettes.length];
};

interface TagListProps {
    tags: string[];
    limit?: number;
    justify?: "start" | "end";
}

const TagList = ({ tags, limit = 2, justify = "start" }: TagListProps) => {
    const displayTags = tags.slice(0, limit);
    const remaining = tags.length - limit;
    return (
        <div className={`flex items-center gap-1.5 flex-wrap ${justify === 'end' ? 'justify-end' : 'justify-start'}`}>
            {displayTags.map((tag, idx) => (
                <span key={idx} className={`px-2 py-0.5 text-[10px] rounded-md border whitespace-nowrap ${getTagStyle(tag)}`}>
                    {tag}
                </span>
            ))}
            {remaining > 0 && (
                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded-md border border-slate-200 font-medium">+{remaining}</span>
            )}
        </div>
    );
};

export default function CategoriesPage() {
    const navigate = useNavigate(); // 3. Hook
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [selectedCatId, setSelectedCatId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);

    // 获取分类列表
    const fetchCategories = async () => {
        try {
            const data = await getCategoryList();
            setCategories(data);
        } catch (error) {
            console.error('获取分类列表失败:', error);
        }
    };

    // 根据分类获取文章
    const fetchArticles = async (catId: string) => {
        try {
            setLoading(true);
            const data = await getArticlesByCategory(catId);
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
        fetchCategories();
    }, []);

    // 分类变化时获取对应文章
    useEffect(() => {
        if (selectedCatId) {
            fetchArticles(selectedCatId);
        }
    }, [selectedCatId]);

    // --- Modal State ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
    const [formData, setFormData] = useState<CategoryFormData>({ name: '', description: '', themeId: 'blue', iconKey: 'Folder' });

    // --- Delete Category Modal State ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

    // --- 4. 新增：Article Actions State ---
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());
    const [isArticleDeleteModalOpen, setIsArticleDeleteModalOpen] = useState(false);
    const [articleToDelete, setArticleToDelete] = useState<string | null>(null);

    // --- Category Actions (保持不变) ---
    const handleOpenCreate = () => {
        setEditingCategory(null);
        setFormData({ name: '', description: '', themeId: 'blue', iconKey: 'Folder' });
        setIsModalOpen(true);
    };

    const handleOpenEdit = (category: CategoryItem) => {
        setEditingCategory(category);
        setFormData({
            name: category.name,
            description: category.description,
            themeId: category.themeId,
            iconKey: category.iconKey
        });
        setIsModalOpen(true);
    };

    const handleDeleteCategory = (catId: string) => {
        setCategoryToDelete(catId);
        setIsDeleteModalOpen(true);
    };

    const confirmDeleteCategory = async () => {
        if (categoryToDelete) {
            try {
                await deleteCategory(categoryToDelete);
                setCategories(prev => prev.filter(c => c.id !== categoryToDelete));
                if (selectedCatId === categoryToDelete) {
                    setSelectedCatId('all');
                    setDisplayArticles([]);
                }
            } catch (error) {
                console.error('删除分类失败:', error);
            }
        }
        setIsDeleteModalOpen(false);
        setCategoryToDelete(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        try {
            if (editingCategory) {
                // 更新分类
                const updatedCategory = await updateCategory(editingCategory.id, formData);
                setCategories(prev => prev.map(c => c.id === editingCategory.id ? updatedCategory : c));
            } else {
                // 创建分类
                const newCategory = await createCategory(formData);
                setCategories(prev => [...prev, newCategory]);
            }
            setIsModalOpen(false);
        } catch (error) {
            console.error('操作分类失败:', error);
        }
    };

    // --- 5. 新增：Article Actions ---
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
            // 将删除的 ID 加入集合，触发重绘
            setDeletedArticleIds(prev => new Set(prev).add(articleToDelete));
        }
        setIsArticleDeleteModalOpen(false);
        setArticleToDelete(null);
    };

    // --- Derived State ---
    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, categories]);

    // 过滤已删除的文章
    const filteredDisplayArticles = useMemo(() => {
        return displayArticles.filter(art => !deletedArticleIds.has(art.id));
    }, [displayArticles, deletedArticleIds]);

    // 确保 activeCategory 始终有值，避免 undefined 错误
    const activeCategory = categories.find(c => c.id === selectedCatId) || categories[0] || {
        id: 'all',
        name: '所有分类',
        description: '所有分类下的文章',
        count: 0,
        isSystem: true,
        themeId: 'blue',
        iconKey: 'Folder'
    };
    const getThemeStyles = (themeId: string) => COLOR_THEMES.find(t => t.id === themeId) || COLOR_THEMES[0];
    const getCategoryIcon = (cat: CategoryItem) => {
        if (cat.id === 'uncategorized') return <Inbox className="w-5 h-5" />;
        return ICON_MAP[cat.iconKey] || <Folder className="w-5 h-5" />;
    };

    const handleMenuClick = (e: React.MouseEvent, articleId: string) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === articleId ? null : articleId);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24" onClick={() => setActiveMenuId(null)}>

            {/* Category Delete Modal */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDeleteCategory}
                title="确认删除分类?"
                description={<span>确定要删除该分类吗？删除后，该分类下的文章将自动归入 <span className="font-bold text-slate-800">未分类</span> 状态。</span>}
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

            {/* 分类创建/编辑模态框 */}
            <CategoryModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={(newFormData) => {
                    // 创建一个模拟的FormEvent对象
                    const mockEvent = { preventDefault: () => {} } as React.FormEvent;
                    // 更新本地formData状态
                    setFormData(newFormData);
                    // 调用原来的handleSubmit函数
                    handleSubmit(mockEvent);
                }}
                editingCategory={editingCategory}
                initialFormData={formData}
                iconMap={ICON_MAP}
                colorThemes={COLOR_THEMES}
            />

            {/* Header ... (保持不变) */}
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

            {/* Section 1: Sticky Category Strip (保持不变) ... */}
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

            {/* Section 2: Content List */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[500px]">
                {/* List Toolbar (保持不变) ... */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg ${getThemeStyles(activeCategory.themeId).bg} ${getThemeStyles(activeCategory.themeId).text}`}>{getCategoryIcon(activeCategory)}</div>
                            <h2 className="text-lg font-bold text-slate-800">{activeCategory.name}</h2>
                            {!activeCategory.isSystem && (
                                <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
                                    <button onClick={() => handleOpenEdit(activeCategory)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="编辑分类"><Edit className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDeleteCategory(activeCategory.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="删除分类"><Trash className="w-3.5 h-3.5" /></button>
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
                {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filteredDisplayArticles.map((article) => (
                            <div key={article.id}
                                onClick={() => navigate(`/article/${article.collId}/${article.id}`)}
                                className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col h-full relative">
                                <div className="flex justify-between items-start gap-3 mb-2">
                                    <div className="flex items-start gap-3 flex-1 overflow-hidden">
                                        <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg shrink-0 mt-0.5"><FileText className="w-4 h-4" /></div>
                                        <h3 className="text-sm font-bold text-slate-800 leading-snug group-hover:text-orange-600 transition-colors line-clamp-2">{article.title}</h3>
                                    </div>
                                    <div className="relative shrink-0">
                                        <button onClick={(e) => handleMenuClick(e, article.id)} className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"><MoreHorizontal className="w-4 h-4" /></button>

                                        {/* 8. 绑定下拉菜单点击事件 */}
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
                                <p className="text-xs text-slate-500 line-clamp-1 mb-3 pl-[34px] leading-relaxed">{article.desc}</p>
                                <div className="flex items-end justify-between w-full pt-3 border-t border-slate-50 mt-auto pl-1">
                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium pb-0.5">
                                        <span>{article.date}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime} 分钟</span>
                                    </div>
                                    <TagList tags={article.tags} limit={1} justify="end" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {displayArticles.map((article) => (
                            <div key={article.id}
                                onClick={() => navigate(`/article/${article.collId}/${article.id}`)}
                                className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-4 relative">
                                <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-100 transition-colors shrink-0"><FileText className="w-5 h-5" /></div>
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <h3 className="text-sm font-bold text-slate-700 truncate group-hover:text-orange-600 transition-colors">{article.title}</h3>
                                    <p className="text-xs text-slate-400 truncate hidden md:block">{article.desc}</p>
                                </div>
                                <div className="flex flex-col items-end justify-center gap-2 ml-4 shrink-0">
                                    <div className="flex items-center gap-3 text-xs text-slate-400">
                                        <span className="font-mono">{article.date}</span>
                                        <span className="hidden sm:flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime}m</span>
                                    </div>
                                    <TagList tags={article.tags} limit={3} justify="end" />
                                </div>
                                <div className="relative shrink-0 ml-2">
                                    <button onClick={(e) => handleMenuClick(e, article.id)} className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"><MoreHorizontal className="w-4 h-4" /></button>

                                    {/* 9. 绑定列表模式下的下拉菜单 */}
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
                        ))}
                    </div>
                )}

                {loading ? (
                        <div className="flex justify-center items-center py-24">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
                        </div>
                    ) : filteredDisplayArticles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                        <FolderOpen className="w-12 h-12 text-slate-200 mb-3" />
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