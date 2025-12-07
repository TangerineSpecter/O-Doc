import React, { useState, useMemo } from 'react';
import {
    Folder, FolderOpen, Search, FileText, Clock,
    Plus, MoreHorizontal, LayoutGrid, List, Layers,
    Server, PenTool, Globe, Users, Database, Box, Edit, Trash,
    X, Inbox, Save
} from 'lucide-react';
import ConfirmationModal from '../components/ConfirmationModal';

interface CategoryItem {
    id: string;
    name: string;
    count: number;
    description: string;
    iconKey: string;
    themeId: string;
    isSystem?: boolean;
}

interface CategoryFormData {
    name: string;
    description: string;
    themeId: string;
    iconKey: string;
}

// --- 1. 图标映射池 (用于新建/编辑时选择) ---
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

// --- 2. 颜色主题池 (修复：添加 explicitDotClass 确保颜色被编译) ---
const COLOR_THEMES = [
    { id: 'blue', label: '科技蓝', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', dot: 'bg-blue-600' },
    { id: 'emerald', label: '翡翠绿', bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', dot: 'bg-emerald-600' },
    { id: 'orange', label: '活力橙', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', dot: 'bg-orange-600' },
    { id: 'pink', label: '品红', bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', dot: 'bg-pink-600' },
    { id: 'violet', label: '紫罗兰', bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200', dot: 'bg-violet-600' },
    { id: 'cyan', label: '青色', bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', dot: 'bg-cyan-600' },
    { id: 'slate', label: '极简灰', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200', dot: 'bg-slate-500' },
];

// --- 3. 初始数据 ---
const INITIAL_CATEGORIES: CategoryItem[] = [
    {
        id: 'all',
        name: '全部分类',
        count: 383,
        description: '浏览知识库所有文档',
        iconKey: 'Layers',
        themeId: 'slate',
        isSystem: true
    },
    {
        id: 'uncategorized',
        name: '未分类',
        count: 12,
        description: '暂未关联任何分类的文档',
        iconKey: 'Box',
        themeId: 'slate',
        isSystem: true
    },
    {
        id: 'tech',
        name: '技术研发',
        count: 128,
        description: '后端架构、前端开发及代码规范',
        iconKey: 'Server',
        themeId: 'blue'
    },
    {
        id: 'product',
        name: '产品设计',
        count: 64,
        description: 'PRD文档、UI设计稿及交互规范',
        iconKey: 'PenTool',
        themeId: 'pink'
    },
    {
        id: 'ops',
        name: '运维部署',
        count: 42,
        description: '服务器配置、Docker及CI/CD',
        iconKey: 'Database',
        themeId: 'emerald'
    },
    {
        id: 'marketing',
        name: '市场运营',
        count: 35,
        description: '活动策划、SEO及数据分析',
        iconKey: 'Globe',
        themeId: 'orange'
    },
];

// 模拟标签池
const TAG_POOL = ['基础', '进阶', '最佳实践', 'React', 'Vue', 'Docker', 'API', '设计规范', '运维', '数据库'];

// 生成模拟文章
const generateArticles = (catId: string, categories: CategoryItem[]) => {
    const category = categories.find(c => c.id === catId);
    const catName = category ? category.name : '未知';

    return Array.from({ length: Math.floor(Math.random() * 6) + 4 }).map((_, i) => {
        const tagCount = Math.floor(Math.random() * 3) + 1; // 减少标签数量，避免卡片过挤
        const shuffled = [...TAG_POOL].sort(() => 0.5 - Math.random());
        const tags = shuffled.slice(0, tagCount);

        return {
            id: `art-${catId}-${i}`,
            title: `${catName} - 相关文档 ${i + 1}`,
            desc: '本文档详细记录了该模块的核心业务逻辑与操作流程，旨在帮助团队成员快速理解并上手相关工作。',
            date: '2025-11-21',
            readTime: Math.floor(Math.random() * 20) + 5,
            tags: tags
        };
    });
};

// 颜色辅助函数
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

// --- 组件：标签列表 ---
interface TagListProps {
    tags: string[];
    limit?: number;
    justify?: "start" | "end";
}

const TagList = ({ tags, limit = 2, justify = "start" }: TagListProps) => { // limit 默认为 2，适合卡片
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
    const [categories, setCategories] = useState<CategoryItem[]>(INITIAL_CATEGORIES);
    const [selectedCatId, setSelectedCatId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    // --- Modal State ---
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null); // null = create mode
    const [formData, setFormData] = useState<CategoryFormData>({ name: '', description: '', themeId: 'blue', iconKey: 'Folder' });

    // --- Delete Modal State ---
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

    // --- Actions ---
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

    // 触发删除确认弹窗
    const handleDeleteCategory = (catId: string) => {
        setCategoryToDelete(catId);
        setIsDeleteModalOpen(true);
    };

    // 确认删除逻辑
    const confirmDelete = () => {
        if (categoryToDelete) {
            setCategories(prev => prev.filter(c => c.id !== categoryToDelete));
            if (selectedCatId === categoryToDelete) setSelectedCatId('all');
        }
        setIsDeleteModalOpen(false);
        setCategoryToDelete(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) return;

        if (editingCategory) {
            // Edit
            setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...c, ...formData } : c));
        } else {
            // Create
            const newCat: CategoryItem = {
                id: `cat-${Date.now()}`,
                count: 0,
                isSystem: false,
                ...formData
            };
            setCategories(prev => [...prev, newCat]);
        }
        setIsModalOpen(false);
    };

    // --- Derived State ---
    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, categories]);

    const displayArticles = useMemo(() => {
        if (selectedCatId !== 'all') {
            return generateArticles(selectedCatId, categories);
        }
        return categories.slice(2, 6).flatMap(c => generateArticles(c.id, categories));
    }, [selectedCatId, categories]);

    const activeCategory = categories.find(c => c.id === selectedCatId) || categories[0];

    // Helper to get theme styles
    const getThemeStyles = (themeId: string) => COLOR_THEMES.find(t => t.id === themeId) || COLOR_THEMES[0];

    // Helper to get icon
    const getCategoryIcon = (cat: CategoryItem) => {
        if (cat.id === 'uncategorized') return <Inbox className="w-5 h-5" />;
        return ICON_MAP[cat.iconKey] || <Folder className="w-5 h-5" />;
    };

    // Article Menu Actions
    const handleMenuClick = (e: React.MouseEvent, articleId: string) => {
        e.stopPropagation();
        setActiveMenuId(activeMenuId === articleId ? null : articleId);
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24">

            {/* Delete Confirmation Modal (NEW) */}
            <ConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="确认删除分类?"
                description={
                    <span>
                        确定要删除该分类吗？删除后，该分类下的文章将自动归入 <span className="font-bold text-slate-800">未分类</span> 状态。
                    </span>
                }
                confirmText="确认删除"
                cancelText="取消"
                type="danger"
            />

            {/* Create/Edit Modal Overlay */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsModalOpen(false)}></div>
                    <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-bold text-slate-800">
                                {editingCategory ? '编辑分类' : '新建分类'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">分类名称 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="例如：技术文档"
                                    autoFocus
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">描述说明</label>
                                <textarea
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all resize-none"
                                    placeholder="简要描述该分类下的内容..."
                                />
                            </div>

                            {/* Icon Selection (Fix: Added padding to prevent ring cutoff) */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">选择图标</label>
                                <div className="flex gap-2 overflow-x-auto p-1 pb-2 scrollbar-hide -mx-1 px-1">
                                    {Object.keys(ICON_MAP).map(key => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, iconKey: key })}
                                            className={`p-2 rounded-lg border transition-all flex-shrink-0 ${formData.iconKey === key
                                                ? 'bg-orange-50 border-orange-500 text-orange-600 ring-1 ring-orange-500'
                                                : 'bg-white border-slate-200 text-slate-400 hover:border-orange-200 hover:text-slate-600'
                                                }`}
                                        >
                                            {React.cloneElement(ICON_MAP[key], { className: "w-5 h-5" })}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Color Theme Selection (Fix: Use explicit dot color class) */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">颜色主题</label>
                                <div className="flex flex-wrap gap-2">
                                    {COLOR_THEMES.map(theme => (
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
                                            {/* Fix: 使用明确的颜色类名，确保 Tailwind 编译 */}
                                            <div className={`w-2 h-2 rounded-full ${theme.dot}`}></div>
                                            {theme.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={!formData.name.trim()}
                                    className="px-4 py-2 text-sm text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    {editingCategory ? '保存修改' : '立即创建'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Menu Click Overlay */}
            {activeMenuId && (<div className="fixed inset-0 z-40" onClick={() => setActiveMenuId(null)}></div>)}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        分类管理 <span className="text-orange-500">.</span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        构建结构化的知识体系，让文档井井有条。
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="搜索分类..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all w-64 shadow-sm"
                        />
                    </div>
                    <button
                        onClick={handleOpenCreate}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> 新建分类
                    </button>
                </div>
            </div>

            {/* --- Section 1: Sticky Category Strip (Top Navigation) --- */}
            <div className="sticky top-[64px] z-30 bg-[#F9FAFB]/95 backdrop-blur-md -mx-4 px-4 sm:mx-0 sm:px-0 py-2 mb-6 border-b border-slate-200/50 transition-all">
                <div className="flex gap-3 overflow-x-auto scrollbar-hide py-1">
                    {filteredCategories.map((cat) => {
                        const isSelected = selectedCatId === cat.id;
                        const theme = getThemeStyles(cat.themeId);

                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCatId(cat.id)}
                                className={`
                                    flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-300 flex-shrink-0
                                    ${isSelected
                                        ? 'bg-white border-orange-500 ring-1 ring-orange-500/20 shadow-md'
                                        : 'bg-white border-slate-200 hover:border-orange-200 hover:shadow-sm'}
                                `}
                            >
                                <div className={`p-1 rounded-md transition-colors ${isSelected ? 'bg-orange-100 text-orange-600' : `${theme.bg} ${theme.text}`}`}>
                                    {getCategoryIcon(cat)}
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className={`text-xs font-bold whitespace-nowrap ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                                        {cat.name}
                                    </span>
                                </div>
                                {isSelected && <span className="ml-1 text-[10px] bg-orange-100 text-orange-600 px-1.5 rounded-full font-medium">{cat.count}</span>}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* --- Section 2: Content List --- */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[500px]">

                {/* List Toolbar & Category Details */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            {/* Current Category Icon */}
                            <div className={`p-1.5 rounded-lg ${getThemeStyles(activeCategory.themeId).bg} ${getThemeStyles(activeCategory.themeId).text}`}>
                                {getCategoryIcon(activeCategory)}
                            </div>
                            <h2 className="text-lg font-bold text-slate-800">
                                {activeCategory.name}
                            </h2>
                            {/* Edit/Delete Actions (Only for non-system categories) */}
                            {!activeCategory.isSystem && (
                                <div className="flex items-center gap-1 ml-2 pl-3 border-l border-slate-200">
                                    <button
                                        onClick={() => handleOpenEdit(activeCategory)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                        title="编辑分类"
                                    >
                                        <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteCategory(activeCategory.id)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                                        title="删除分类"
                                    >
                                        <Trash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-2 max-w-2xl leading-relaxed">
                            {activeCategory.description || "暂无描述"}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-end">
                        <span className="text-xs text-slate-400 font-medium hidden sm:inline-block">
                            共 {displayArticles.length} 篇
                        </span>
                        <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>
                        <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Articles Rendering */}
                {viewMode === 'grid' ? (
                    // Grid View
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {displayArticles.map((article) => (
                            <div
                                key={article.id}
                                className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col h-full relative"
                            >
                                {/* Top */}
                                <div className="flex justify-between items-start gap-3 mb-2">
                                    <div className="flex items-start gap-3 flex-1 overflow-hidden">
                                        <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg shrink-0 mt-0.5">
                                            <FileText className="w-4 h-4" />
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-800 leading-snug group-hover:text-orange-600 transition-colors line-clamp-2">
                                            {article.title}
                                        </h3>
                                    </div>
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={(e) => handleMenuClick(e, article.id)}
                                            className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                                        >
                                            <MoreHorizontal className="w-4 h-4" />
                                        </button>
                                        {activeMenuId === article.id && (
                                            <div className="absolute right-0 top-full mt-1 w-24 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                                                <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(null) }} className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Edit className="w-3 h-3" /> 编辑</button>
                                                <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(null) }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash className="w-3 h-3" /> 删除</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {/* Mid */}
                                <p className="text-xs text-slate-500 line-clamp-1 mb-3 pl-[34px] leading-relaxed">
                                    {article.desc}
                                </p>
                                {/* Bottom: Tags moved to bottom-right, inline with metadata */}
                                <div className="flex items-end justify-between w-full pt-3 border-t border-slate-50 mt-auto pl-1">
                                    {/* Left: Date/Time */}
                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-medium pb-0.5">
                                        <span>{article.date}</span>
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime} 分钟</span>
                                    </div>

                                    {/* Right: Tags */}
                                    <TagList tags={article.tags} limit={1} justify="end" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    // List View
                    <div className="flex flex-col gap-3">
                        {displayArticles.map((article) => (
                            <div
                                key={article.id}
                                className="group bg-white rounded-xl p-4 border border-slate-200 hover:border-orange-300 hover:shadow-sm transition-all duration-200 cursor-pointer flex items-center gap-4 relative"
                            >
                                {/* Fix: 图标上色，改为橙色 */}
                                <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl group-hover:bg-orange-100 transition-colors shrink-0">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col gap-1">
                                    <h3 className="text-sm font-bold text-slate-700 truncate group-hover:text-orange-600 transition-colors">
                                        {article.title}
                                    </h3>
                                    <p className="text-xs text-slate-400 truncate hidden md:block">
                                        {article.desc}
                                    </p>
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
                                    {activeMenuId === article.id && (
                                        <div className="absolute right-0 top-full mt-1 w-24 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                                            <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(null) }} className="w-full text-left px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Edit className="w-3 h-3" /> 编辑</button>
                                            <button onClick={(e) => { e.stopPropagation(); setActiveMenuId(null) }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash className="w-3 h-3" /> 删除</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {displayArticles.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                        <FolderOpen className="w-12 h-12 text-slate-200 mb-3" />
                        <p className="text-sm font-medium">该分类下暂无文档</p>
                        <button
                            onClick={handleOpenCreate}
                            className="mt-4 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs rounded-lg hover:border-orange-300 hover:text-orange-600 transition-colors shadow-sm"
                        >
                            创建新文档
                        </button>
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
