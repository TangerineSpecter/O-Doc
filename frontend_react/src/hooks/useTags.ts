import {useCallback, useEffect, useMemo, useState} from 'react';
import {createTag, deleteTag, getTagList, TagItem, updateTag} from '../api/tag';
import {Article, ArticleItem, getArticles} from '../api/article';
import {TagFormData} from '../components/TagModal';
import {useToast} from '../components/ToastProvider';

export const useTags = () => {
    // --- State ---
    const [tags, setTags] = useState<TagItem[]>([]);
    const [selectedTagId, setSelectedTagId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list'); // 默认 list，与 TagsPage 原始逻辑保持一致
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());

    // --- Toast ---
    const toast = useToast();

    // --- Data Fetching ---
    const fetchTags = useCallback(async () => {
        try {
            const data = await getTagList();
            // 修复：后端已开启 CamelCaseJSONRenderer，直接使用返回的驼峰数据即可
            // 不需要再手动映射 tag_id 或 article_count
            setTags(data);
        } catch (error) {
            console.error('获取标签列表失败:', error);
        }
    }, []);

    const fetchArticles = useCallback(async (tagId: string) => {
        try {
            setLoading(true);
            const data = await getArticles(tagId === 'all' ? undefined : {tagId});
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
        fetchTags();
    }, [fetchTags]);

    // Fetch Articles when Tag changes
    useEffect(() => {
        if (selectedTagId) {
            // "all" 或 具体 ID 都通过 API 获取
            fetchArticles(selectedTagId);
        }
    }, [selectedTagId, fetchArticles]);

    // --- Actions: Tag ---
    const handleTagSubmit = async (formData: TagFormData, editingTag: TagItem | null) => {
        try {
            if (editingTag) {
                const updatedTag = await updateTag(editingTag.tagId, formData);
                setTags(prev => prev.map(t => t.tagId === editingTag.tagId ? updatedTag : t));
                toast.success('标签更新成功');
            } else {
                const newTag = await createTag(formData);
                setTags(prev => [...prev, newTag]);
                toast.success('标签创建成功');
            }
            return true;
        } catch (error) {
            console.error('操作标签失败:', error);
            // 显示错误信息给用户
            const err = error as Error;
            toast.error(err.message || '操作标签失败');
            return false;
        }
    };

    const confirmDeleteTag = async (tagId: string) => {
        try {
            await deleteTag(tagId);
            setTags(prev => prev.filter(t => t.tagId !== tagId));
            if (selectedTagId === tagId) {
                setSelectedTagId('all');
                setDisplayArticles([]);
            }
            toast.success('标签删除成功');
            return true;
        } catch (error) {
            console.error('删除标签失败:', error);
            const err = error as Error;
            toast.error(err.message || '删除标签失败');
            return false;
        }
    };

    // --- Actions: Article (Frontend Simulation) ---
    const confirmDeleteArticle = (articleId: string) => {
        setDeletedArticleIds(prev => new Set(prev).add(articleId));
    };

    // --- Derived Data ---
    const filteredTags = useMemo(() => {
        if (!searchQuery) return tags;
        return tags.filter(tag => tag.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [searchQuery, tags]);

    const filteredDisplayArticles = useMemo(() => {
        return displayArticles.filter(art => !deletedArticleIds.has(art.articleId));
    }, [displayArticles, deletedArticleIds]);

    const totalArticles = useMemo(() => tags.reduce((acc, cur) => acc + (cur.articleCount || 0), 0), [tags]);

    const activeTag = useMemo(() => {
        // 修复：这里也要统一使用 tagId
        return tags.find(t => t.tagId === selectedTagId) || {
            tagId: 'all', // 修正字段名
            name: '所有标签',
            articleCount: totalArticles, // 修正字段名
            isSystem: true,
            themeId: 'blue'
        } as unknown as TagItem; // 类型断言处理模拟对象
    }, [tags, selectedTagId, totalArticles]);

    return {
        // Data
        tags,
        filteredTags,
        activeTag,
        displayArticles: filteredDisplayArticles,
        totalArticles,
        loading,

        // State Setters
        selectedTagId, setSelectedTagId,
        searchQuery, setSearchQuery,
        viewMode, setViewMode,

        // Actions
        handleTagSubmit,
        confirmDeleteTag,
        confirmDeleteArticle,
        refreshTags: fetchTags
    };
};