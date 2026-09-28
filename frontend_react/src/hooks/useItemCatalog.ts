import {useEffect, useState} from 'react';
import {getItemCatalog} from '../api/itemCatalog';
import type {CatalogItem} from '../types/api/itemCatalog';

export function useItemCatalog() {
    const [items, setItems] = useState<CatalogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let live = true;
        getItemCatalog(controller.signal).then(value => {if (live) setItems(value);})
            .catch(error => {if (live) setError(error instanceof Error ? error.message : '图鉴读取失败');})
            .finally(() => {if (live) setLoading(false);});
        return () => {live = false; controller.abort();};
    }, [revision]);
    return {items, loading, error, reload: () => {setLoading(true); setError(''); setRevision(value => value + 1);}};
}
