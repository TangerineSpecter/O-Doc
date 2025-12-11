import {useCallback, useEffect, useMemo, useState} from 'react';
import {CategoryItem, createCategory, deleteCategory, getCategoryList, updateCategory} from '../api/category';
import {Article, ArticleItem, getArticles} from '../api/article';
import {CategoryFormData} from '../components/CategoryModal';
import { useSearchParams } from 'react-router-dom';

export const useCategories = () => {
    // --- State ---
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    const [selectedCatId, setSelectedCatId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());
    const [searchParams] = useSearchParams();

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

    // Handle catId from URL
    useEffect(() => {
        const catIdFromUrl = searchParams.get('catId');
        if (catIdFromUrl) {
            // 优先使用分类 ID 查找
            const category = categories.find(c => c.categoryId === catIdFromUrl);
            if (category) {
                setSelectedCatId(category.categoryId);
            } else {
                // 如果没有找到，尝试使用分类名称查找
                const categoryByName = categories.find(c => c.name === catIdFromUrl);
                if (categoryByName) {
                    setSelectedCatId(categoryByName.categoryId);
                }
            }
        }
    }, [categories, searchParams]);

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
                setSelectedCatId('');
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
        return filteredCategories.find(c => c.categoryId === selectedCatId) || filteredCategories[0] || {
            categoryId: 'all',
            name: '所有分类',
            count: 0
        };
    }, [filteredCategories, selectedCatId]);

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