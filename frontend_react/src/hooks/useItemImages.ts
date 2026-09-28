import {useEffect, useState} from 'react';
import {getItemIcons, getManagedInventory} from '../api/itemIcons';
import type {InventoryItem} from '../types/api/travel';
import type {ItemIcon, PictureFilter} from '../types/api/itemIcons';

export function useItemImages(mode: 'items' | 'library', search: string, agentId: string, picture: PictureFilter) {
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [icons, setIcons] = useState<ItemIcon[]>([]);
    const [agents, setAgents] = useState<{id: string; name: string}[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true); setError('');
            const load = async () => {
                try {
                    if (mode === 'items') {
                        const data = await getManagedInventory({search, agentId, picture, page}, controller.signal);
                        if (controller.signal.aborted) return;
                        setItems(data.list); setAgents(data.agents); setTotal(data.total); setPageSize(data.pageSize); setPage(data.page);
                    } else {
                        const data = await getItemIcons({search, page}, controller.signal);
                        if (controller.signal.aborted) return;
                        setIcons(data.list); setTotal(data.total); setPageSize(data.pageSize); setPage(data.page);
                    }
                } catch (e) {
                    if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '图片列表加载失败');
                } finally {if (!controller.signal.aborted) setLoading(false);}
            };
            void load();
        }, 200);
        return () => {controller.abort(); window.clearTimeout(timer);};
    }, [mode, search, agentId, picture, page, revision]);
    return {items, icons, agents, page, setPage, total, pageSize, loading, error, reload: () => setRevision(value => value + 1)};
}
