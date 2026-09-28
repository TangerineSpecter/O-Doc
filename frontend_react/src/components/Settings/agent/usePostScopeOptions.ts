import {useEffect, useState} from 'react';
import {getAnthologyList} from '@/api/anthology';
import {getWorldCategories} from '@/api/agentWorld';

export interface PostScopeOption {id: string; name: string}

export function usePostScopeOptions() {
    const [collections, setCollections] = useState<PostScopeOption[]>([]);
    const [categories, setCategories] = useState<PostScopeOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let live = true;
        setLoading(true);
        setError('');
        Promise.all([getAnthologyList('agent'), getWorldCategories()]).then(([items, types]) => {
            if (!live) return;
            setCollections(items.filter(item => item.type === 'agent').map(item => ({id: item.collId, name: item.title})));
            setCategories(types.filter(item => item.enabled).map(item => ({id: item.id, name: item.name})));
        }).catch(error => {
            if (live) setError(error instanceof Error ? error.message : '帖子范围加载失败');
        }).finally(() => {if (live) setLoading(false);});
        return () => {live = false;};
    }, [revision]);
    return {collections, categories, loading, error, retry: () => setRevision(value => value + 1)};
}
