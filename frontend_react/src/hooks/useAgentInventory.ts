import {useEffect, useState} from 'react';
import {getInventory} from '../api/travel';
import type {InventoryItem} from '../types/api/travel';

export function useAgentInventory(agentId: string) {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let live = true;
        setItems([]); setLoading(true); setError('');
        getInventory(agentId, controller.signal).then(value => {if (live) setItems(value);})
            .catch(e => {if (live) setError(e instanceof Error ? e.message : '背包读取失败');})
            .finally(() => {if (live) setLoading(false);});
        return () => {live = false; controller.abort();};
    }, [agentId, revision]);
    return {items, loading, error, reload: () => setRevision(value => value + 1)};
}
