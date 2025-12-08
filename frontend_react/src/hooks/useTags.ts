import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    getTagList,
    createTag,
    updateTag,
    deleteTag,
    getArticlesByTag,
    TagItem,
    ArticleItem
} from '../api/tag';
import { TagFormData } from '../components/TagModal';

export const useTags = () => {
    // --- State ---
    const [tags, setTags] = useState<TagItem[]>([]);
    const [selectedTagId, setSelectedTagId] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list'); // 默认 list，与 TagsPage 原始逻辑保持一致
    const [displayArticles, setDisplayArticles] = useState<ArticleItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletedArticleIds, setDeletedArticleIds] = useState<Set<string>>(new Set());

    // --- Data Fetching ---
    const fetchTags = useCallback(async () => {
        try {
            const data = await getTagList();
            setTags(data);
        } catch (error) {
            console.error('获取标签列表失败:', error);
        }
    }, []);

    const fetchArticles = useCallback(async (tagId: string) => {
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
                const updatedTag = await updateTag(editingTag.id, formData);
                setTags(prev => prev.map(t => t.id === editingTag.id ? updatedTag : t));
            } else {
                const newTag = await createTag(formData);
                setTags(prev => [...prev, newTag]);
            }
            return true;
        } catch (error) {
            console.error('操作标签失败:', error);
            return false;
        }
    };

    const confirmDeleteTag = async (tagId: string) => {
        try {
            await deleteTag(tagId);
            setTags(prev => prev.filter(t => t.id !== tagId));
            if (selectedTagId === tagId) {
                setSelectedTagId('all');
                setDisplayArticles([]);
            }
            return true;
        } catch (error) {
            console.error('删除标签失败:', error);
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

    const totalArticles = useMemo(() => tags.reduce((acc, cur) => acc + cur.count, 0), [tags]);

    const activeTag = useMemo(() => {
        return tags.find(t => t.id === selectedTagId) || {
            id: 'all',
            name: '所有标签',
            count: totalArticles,
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