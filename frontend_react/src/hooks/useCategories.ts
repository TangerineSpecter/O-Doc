import {useCallback, useEffect, useMemo, useState} from 'react';
import {CategoryItem, createCategory, deleteCategory, getCategoryList, updateCategory} from '../api/category';
import {Article, ArticleItem, getArticles} from '../api/article';
import {CategoryFormData} from '../components/CategoryModal';
import {useSearchParams} from 'react-router-dom';

export const useCategories = () => {
    // --- State ---
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();

    // 核心修改：直接从 URL 获取初始 ID，如果没有则默认为 'all'
    // 这样组件一初始化就能拿到正确的 ID，不用等待 useEffect
    const urlCatId = searchParams.get('catId') || 'all';
    const [selectedCatId, setSelectedCatId] = useState(urlCatId);

    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());

    // --- Data Fetching ---
    const fetchCategories = useCallback(async () => {
        try {
            // 不再需要传递 include_uncategorized 参数 (或者后端已忽略)
            const data = await getCategoryList(true);

            // 移除原本针对 'uncategorized' 的特殊 map 处理逻辑
            // 现在只负责添加前端专用的 'all' (所有分类)

            const totalCount = data.reduce((sum, cat) => sum + (cat.articleCount || 0), 0);
            const allCategory: CategoryItem = {
                categoryId: 'all',
                name: '所有分类',
                articleCount: totalCount,
                description: '查看所有文档',
                iconKey: 'LayoutGrid',
                themeId: 'blue',
                isSystem: true
            };

            setCategories([allCategory, ...data]);
        } catch (error) {
            console.error('获取分类列表失败:', error);
        }
    }, []);

    // 核心修改：fetchArticles 不再依赖内部 state，而是接收参数
    const fetchArticles = useCallback(async (catId: string) => {
        try {
            setLoading(true);
            // 如果是 'all'，传 undefined 给后端（假设后端支持不传参数查全部）
            const query = catId === 'all' ? undefined : {categoryId: catId};

            const data = await getArticles(query);

            const formattedData: ArticleItem[] = data.map((article: Article) => ({
                articleId: article.articleId,
                title: article.title,
                desc: article.desc || '',
                date: article.createdAt,
                readTime: article.readTime || 0,
                tags: article.tagDetails?.map(tag => tag.name) || [],
                collId: article.collId,
                collection: article.collection
            }));
            setDisplayArticles(formattedData);
        } catch (error) {
            console.error('获取文章失败:', error);
            setDisplayArticles([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial Fetch (Categories)
    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // 核心修改：监听 URL 变化并同步到 State 和 触发请求
    useEffect(() => {
        const catIdFromUrl = searchParams.get('catId') || 'all';

        // 1. 同步状态（为了 UI 高亮）
        setSelectedCatId(catIdFromUrl);

        // 2. 立即发起请求（不再依赖 selectedCatId 的变化，直接用 URL 参数）
        fetchArticles(catIdFromUrl);

    }, [searchParams, fetchArticles]);
    // 注意：这里去掉了 categories 依赖。文章列表的加载不需要等待分类列表加载完成。

    // --- State Setters 包装器 ---
    // 当用户在界面点击分类时，更新 URL，触发上面的 useEffect
    const handleSetSelectedCatId = (id: string) => {
        setSelectedCatId(id);
        setSearchParams({catId: id});
    };

    // ... (后续 Actions 代码保持不变: handleCategorySubmit, confirmDeleteCategory 等)
    // ... 请直接保留原有的 Actions 代码 ...

    const confirmDeleteArticle = (articleId: string) => {
        setDeletedArticleIds(prev => new Set(prev).add(articleId));
    };

    const handleCategorySubmit = async (formData: CategoryFormData, editingCategory: CategoryItem | null) => {
        // ... (保持原样)
        try {
            if (editingCategory) {
                const updatedCategory = await updateCategory(editingCategory.categoryId, formData);
                setCategories(prev => prev.map(c => c.categoryId === editingCategory.categoryId ? updatedCategory : c));
            } else {
                const newCategory = await createCategory(formData);
                setCategories(prev => [...prev, newCategory]);
                await fetchCategories();
            }
            return true;
        } catch (error) {
            console.error('操作分类失败:', error);
            return false;
        }
    };

    const confirmDeleteCategory = async (catId: string) => {
        // ... (保持原样)
        try {
            await deleteCategory(catId);
            setCategories(prev => prev.filter(c => c.categoryId !== catId));
            if (selectedCatId === catId) {
                handleSetSelectedCatId('all'); // 使用新的 handler
            }
            fetchCategories();
            return true;
        } catch (error) {
            console.error('删除分类失败:', error);
            return false;
        }
    };

    // ... (Derived Data 保持不变)
    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, categories]);

    const filteredDisplayArticles = useMemo(() => {
        return displayArticles.filter(art => !deletedArticleIds.has(art.articleId));
    }, [displayArticles, deletedArticleIds]);

    const activeCategory = useMemo(() => {
        // 这里需要注意：如果 categories 还没回来，selectedCatId 是 URL 里的 ID
        // 我们需要由一个临时的 fallback，避免标题闪烁或者显示错误
        return filteredCategories.find(c => c.categoryId === selectedCatId) ||
            // 尝试用 categories 里的 name 匹配（兼容旧逻辑，如果是 name 传参）
            filteredCategories.find(c => c.name === selectedCatId) ||
            {
                categoryId: 'all',
                name: selectedCatId === 'all' ? '所有分类' : '加载中...',
                articleCount: 0,
                isSystem: true,
                themeId: 'blue',
                iconKey: 'Folder'
            } as CategoryItem;
    }, [filteredCategories, selectedCatId]);

    return {
        categories,
        filteredCategories,
        activeCategory,
        displayArticles: filteredDisplayArticles,
        loading,
        selectedCatId,
        setSelectedCatId: handleSetSelectedCatId, // 暴露修改了 URL 的 Setter
        searchQuery, setSearchQuery,
        viewMode, setViewMode,
        handleCategorySubmit,
        confirmDeleteCategory,
        confirmDeleteArticle,
        refreshCategories: fetchCategories
    };
};