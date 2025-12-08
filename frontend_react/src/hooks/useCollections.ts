import { useState, useEffect, useMemo, useCallback } from 'react';
import { useToast } from '../components/ToastProvider';
import { getAnthologyList, createAnthology, sortAnthology, updateAnthology, deleteAnthology, CreateAnthologyParams, Anthology } from '../api/anthology';
import { getIconComponent } from '../constants/iconList';
import { Collection } from '../components/SortableCollectionCard';
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

export const useCollections = () => {
    const toast = useToast();
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(false);
    
    // 筛选排序状态
    const [filterType, setFilterType] = useState('all');
    const [sortType, setSortType] = useState('default');

    // 1. 获取数据
    const fetchCollections = useCallback(async () => {
        setLoading(true);
        try {
            const data: Anthology[] = await getAnthologyList();
            const processedData: Collection[] = data.map((anthology: Anthology) => ({
                ...anthology,
                articles: anthology.articles || [],
                count: anthology.count || 0,
                icon: getIconComponent(anthology.icon_id)
            }));
            // 默认排序
            processedData.sort((a, b) => (a.sort || 0) - (b.sort || 0));
            setCollections(processedData);
        } catch (error) {
            console.error(error);
            toast.error('获取文集列表失败');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        fetchCollections();
    }, [fetchCollections]);

    // 2. 处理计算属性 (Filter & Sort)
    const displayCollections = useMemo(() => {
        let result = [...collections];
        if (filterType === 'top') result = result.filter(item => item.isTop);
        
        if (sortType === 'count') result.sort((a, b) => b.count - a.count);
        else if (sortType === 'az') result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
        
        return result;
    }, [collections, filterType, sortType]);

    // 3. 处理拖拽排序
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = collections.findIndex((c) => c.id === active.id);
        const newIndex = collections.findIndex((c) => c.id === over.id);

        // 乐观更新 (Optimistic UI Update)
        const newCollections = arrayMove(collections, oldIndex, newIndex);
        setCollections(newCollections);

        const draggedItem = newCollections[newIndex];
        const pinnedCount = collections.filter(c => c.isTop).length;
        let newSortOrder = newIndex - pinnedCount + 1;
        if (newSortOrder < 1) newSortOrder = 1;

        try {
            await sortAnthology(draggedItem.coll_id, newSortOrder);
            toast.success('排序已更新');
        } catch (error) {
            console.error('排序更新失败', error);
            toast.error('排序同步失败');
            // 回滚
            const reverted = arrayMove(newCollections, newIndex, oldIndex);
            setCollections(reverted);
        }
    };

    // 4. 处理创建
    const addCollection = async (data: any) => {
        try {
            const params: CreateAnthologyParams = {
                title: data.title,
                description: data.description,
                iconId: data.iconId,
                permission: data.permission,
                isTop: data.isTop,
                sort: collections.length + 1
            };
            const response = await createAnthology(params);
            const newItem: Collection = {
                ...response,
                articles: [],
                count: 0,
                isTop: response.isTop || false,
                icon: getIconComponent(response.icon_id)
            };
            setCollections((prev) => {
                const pinned = prev.filter(c => c.isTop);
                const unpinned = prev.filter(c => !c.isTop);
                return [...pinned, newItem, ...unpinned];
            });
            toast.success("文集创建成功！");
            return true;
        } catch (error) {
            toast.error("创建失败");
            return false;
        }
    };

    // 5. 处理更新 (集成后端接口)
    const updateCollection = async (id: number, data: any) => {
        try {
            const collection = collections.find(c => c.id === id);
            if (!collection) {
                toast.error("文集不存在");
                return false;
            }
            
            const params: Partial<CreateAnthologyParams> = {
                title: data.title,
                description: data.description,
                iconId: data.iconId,
                permission: data.permission,
                isTop: data.isTop
            };
            
            const response = await updateAnthology(collection.coll_id, params);
            
            // 更新本地数据
            setCollections(prev => prev.map(c => {
                if (c.id === id) {
                    return {
                        ...c,
                        ...response,
                        isTop: response.isTop || false,
                        icon: getIconComponent(response.icon_id)
                    };
                }
                return c;
            }));
            
            toast.success("文集已更新");
            return true;
        } catch (error) {
            toast.error("更新失败");
            return false;
        }
    };

    // 6. 处理删除 (集成后端接口)
    const removeCollection = async (id: number) => {
        try {
            const collection = collections.find(c => c.id === id);
            if (!collection) {
                toast.error("文集不存在");
                return false;
            }
            
            await deleteAnthology(collection.coll_id);
            
            // 更新本地数据
            setCollections(prev => prev.filter(c => c.id !== id));
            
            toast.success('文集已删除');
            return true;
        } catch (error) {
            toast.error("删除失败");
            return false;
        }
    };

    return {
        collections,
        displayCollections,
        loading,
        filterType, setFilterType,
        sortType, setSortType,
        handleDragEnd,
        addCollection,
        updateCollection,
        removeCollection,
        refresh: fetchCollections
    };
};