import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    getTagList,
    createTag,
    updateTag,
    deleteTag,
    TagItem,
    ArticleItem
} from '../api/tag';
import { getArticles, Article } from '../api/article';
import { TagFormData } from '../components/TagModal';
import { useToast } from '../components/ToastProvider';

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
            // 转换数据格式，确保字段名一致
            const formattedTags: TagItem[] = data.map(tag => ({
                ...tag,
                tag_id: tag.tag_id,
                article_count: tag.article_count || 0
            }));
            setTags(formattedTags);
        } catch (error) {
            console.error('获取标签列表失败:', error);
        }
    }, []);

    const fetchArticles = useCallback(async (tagId: string) => {
        try {
            setLoading(true);
            const data = await getArticles(tagId === 'all' ? undefined : { tagId });
            // 转换数据格式
            const formattedData: ArticleItem[] = data.map((article: Article) => ({
                id: article.articleId,
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
                const updatedTag = await updateTag(editingTag.tag_id, formData);
                setTags(prev => prev.map(t => t.tag_id === editingTag.tag_id ? updatedTag : t));
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
            setTags(prev => prev.filter(t => t.tag_id !== tagId));
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
        return displayArticles.filter(art => !deletedArticleIds.has(art.id));
    }, [displayArticles, deletedArticleIds]);

    const totalArticles = useMemo(() => tags.reduce((acc, cur) => acc + (cur.article_count || 0), 0), [tags]);

    const activeTag = useMemo(() => {
        return tags.find(t => t.tag_id === selectedTagId) || {
            tag_id: 'all',
            name: '所有标签',
            article_count: totalArticles,
            isSystem: true,
            themeId: 'blue'
        };
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