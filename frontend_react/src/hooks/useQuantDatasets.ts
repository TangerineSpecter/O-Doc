import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantDataset} from '../types/api/quantDataset';
export function useQuantDatasets(collection: string, offset: number, selected: string) {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{key: string; total: number; items: QuantDataset[]; detail?: QuantDataset; error: string}>({key: '', total: 0, items: [], error: ''});
    const key = JSON.stringify([collection, offset, selected, revision]);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const abort = new AbortController();
        void (async () => {
            try {
                const response = await quantApi.datasets(collection, offset, abort.signal);
                const id = response.items.find(row => row.id === selected)?.id || response.items[0]?.id;
                const detail = id ? await quantApi.dataset(collection, id, abort.signal) : undefined;
                if (!abort.signal.aborted) setResult({key, ...response, detail, error: ''});
            } catch (cause) {
                if (!abort.signal.aborted) setResult({key, items: [], total: 0, error: cause instanceof Error ? cause.message : '行情加载失败'});
            }
        })();
        return () => abort.abort();
    }, [collection, offset, selected, key]);
    const loading = key !== result.key;
    return {loading, items: loading ? [] : result.items, total: loading ? 0 : result.total, detail: loading ? undefined : result.detail, error: loading ? '' : result.error, reload};
}
