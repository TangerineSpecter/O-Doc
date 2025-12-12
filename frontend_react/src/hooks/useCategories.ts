import {useCallback, useEffect, useMemo, useState} from 'react';
import {CategoryItem, createCategory, deleteCategory, getCategoryList, updateCategory} from '../api/category';
import {Article, ArticleItem, getArticles} from '../api/article';
import {CategoryFormData} from '../components/CategoryModal';
import { useSearchParams } from 'react-router-dom';

export const useCategories = () => {
    // --- State ---
    const [categories, setCategories] = useState<CategoryItem[]>([]);
    // 修改：默认选中 'all'
    const [selectedCatId, setSelectedCatId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());
    const [searchParams] = useSearchParams();

    // --- Data Fetching ---
    const fetchCategories = useCallback(async () => {
        try {
            // 修改：传入 true 获取包含“未分类”的列表
            const data = await getCategoryList(true);

            // 处理后端返回的数据，为未分类设置默认属性和系统标识
            const processedData = data.map(cat => {
                if (cat.categoryId === 'uncategorized') {
                    return {
                        ...cat,
                        iconKey: 'Inbox', // 默认图标
                        themeId: 'slate', // 默认主题
                        isSystem: true    // 标记为系统分类（不可编辑/删除）
                    };
                }
                return cat;
            });

            // 计算所有文章总数
            const totalCount = processedData.reduce((sum, cat) => sum + (cat.articleCount || 0), 0);

            // 构造“所有分类”对象
            const allCategory: CategoryItem = {
                categoryId: 'all',
                name: '所有分类',
                articleCount: totalCount,
                description: '查看所有文档',
                iconKey: 'LayoutGrid',
                themeId: 'blue',
                isSystem: true
            };

            // 将“所有分类”放在列表首位
            setCategories([allCategory, ...processedData]);
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
                // 插入到 "所有分类" 和 "未分类" (如果存在) 之后，或者直接 append
                // 这里简单处理，追加到列表末尾，或者你需要刷新列表
                // 为了保持顺序，最简单的办法是重新 fetch，或者手动插入
                // 鉴于目前逻辑，直接追加即可
                setCategories(prev => [...prev, newCategory]);
                await fetchCategories(); // 刷新以确保排序和统计正确
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
            // 如果删除的是当前选中的，重置为 'all'
            if (selectedCatId === catId) {
                setSelectedCatId('all');
            }
            // 刷新以更新“所有分类”的计数
            fetchCategories();
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
            count: 0,
            isSystem: true // 兜底对象也要标记为 system
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