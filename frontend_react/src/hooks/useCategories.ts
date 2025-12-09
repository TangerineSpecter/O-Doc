import {useCallback, useEffect, useMemo, useState} from 'react';
import {CategoryItem, createCategory, deleteCategory, getCategoryList, updateCategory} from '../api/category';
import {Article, ArticleItem, getArticles} from '../api/article';
import {CategoryFormData} from '../components/CategoryModal';

export const useCategories = () => {
    // --- State ---
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [selectedCatId, setSelectedCatId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());

    // --- Data Fetching ---
    const fetchCategories = useCallback(async () => {
        try {
            const data = await getCategoryList();
            setCategories(data);
        } catch (error) {
            console.error('获取分类列表失败:', error);
        }
    }, []);

    const fetchArticles = useCallback(async (catId: string) => {
        try {
            setLoading(true);
            const data = await getArticles(catId === 'all' ? undefined : {categoryId: catId});
            // 转换数据格式
            const formattedData: ArticleItem[] = data.map((article: Article) => ({
                articleId: article.articleId,
                title: article.title,
                desc: article.desc || '',
                date: article.createdAt,
                readTime: article.readTime || 0,
                tags: article.tags?.map(tag => tag.name) || [],
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

    // Initial Fetch
    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    // Fetch Articles when Category changes
    useEffect(() => {
        if (selectedCatId) {
            fetchArticles(selectedCatId);
        }
    }, [selectedCatId, fetchArticles]);

    // --- Actions: Category ---
    const confirmDeleteArticle = (articleId: string) => {
        // 这里只是前端模拟删除状态，实际项目中应调用 deleteArticle API
        setDeletedArticleIds(prev => new Set(prev).add(articleId));
    };

    const handleCategorySubmit = async (formData: CategoryFormData, editingCategory: CategoryItem | null) => {
        try {
            if (editingCategory) {
                const updatedCategory = await updateCategory(editingCategory.categoryId, formData);
                setCategories(prev => prev.map(c => c.categoryId === editingCategory.categoryId ? updatedCategory : c));
            } else {
                const newCategory = await createCategory(formData);
                setCategories(prev => [...prev, newCategory]);
            }
            return true; // Success
        } catch (error) {
            console.error('操作分类失败:', error);
            return false; // Failed
        }
    };

    const confirmDeleteCategory = async (catId: string) => {
        try {
            await deleteCategory(catId);
            setCategories(prev => prev.filter(c => c.categoryId !== catId));
            if (selectedCatId === catId) {
                setSelectedCatId('all');
                setDisplayArticles([]);
            }
            return true;
        } catch (error) {
            console.error('删除分类失败:', error);
            return false;
        }
    };

    // --- Actions: Article ---
    // --- Derived Data ---
    const filteredCategories = useMemo(() => {
        if (!searchQuery) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, categories]);

    const filteredDisplayArticles = useMemo(() => {
        return displayArticles.filter(art => !deletedArticleIds.has(art.articleId));
    }, [displayArticles, deletedArticleIds]);

    const activeCategory = useMemo(() => {
        return categories.find(c => c.categoryId === selectedCatId) || categories[0] || {
            categoryId: 'all',
            name: '所有分类',
            description: '所有分类下的文章',
            count: 0,
            isSystem: true,
            themeId: 'blue',
            iconKey: 'Folder'
        };
    }, [categories, selectedCatId]);

    return {
        // Data
        categories,
        filteredCategories,
        activeCategory,
        displayArticles: filteredDisplayArticles,
        loading,

        // State Setters
        selectedCatId, setSelectedCatId,
        searchQuery, setSearchQuery,
        viewMode, setViewMode,

        // Actions
        handleCategorySubmit,
        confirmDeleteCategory,
        confirmDeleteArticle,
        refreshCategories: fetchCategories
    };
};