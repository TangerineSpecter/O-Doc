import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantComparison, QuantFactorMergeList} from '../types/api/quantComparison';

export function useQuantComparisons(collection: string, factorId: string, offset: number, selected: string) {
    const [epoch, setEpoch] = useState(0), [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
    const key = JSON.stringify([collection, factorId, offset, selected, epoch]);
    const [value, setValue] = useState<{key: string; items: QuantComparison[]; total: number; detail?: QuantComparison; merges: QuantFactorMergeList; error: string}>({key: '', items: [], total: 0, merges: {total: 0, items: []}, error: ''});
    const reload = useCallback(() => setEpoch(value => value + 1), []);
    useEffect(() => {
        const abort = new AbortController();
        void (async () => {
            try {
                const [list, merges] = await Promise.all([quantApi.comparisons(collection, factorId, offset, abort.signal), quantApi.factorMerges(collection, factorId, offset, abort.signal)]);
                const id = selected || list.items[0]?.id;
                const detail = id ? await quantApi.comparison(collection, id, abort.signal) : undefined;
                if (!abort.signal.aborted) setValue({key, ...list, detail, merges, error: ''});
            } catch (cause) {if (!abort.signal.aborted) setValue({key, items: [], total: 0, merges: {total: 0, items: []}, error: cause instanceof Error ? cause.message : '对照证据加载失败'});}
        })();
        return () => abort.abort();
    }, [collection, factorId, offset, selected, key]);
    const act = useCallback(async (action: () => Promise<unknown>) => {
        setBusy(true); setActionError('');
        try {await action(); reload(); return true;}
        catch (cause) {setActionError(cause instanceof Error ? cause.message : '操作失败，请重试'); return false;}
        finally {setBusy(false);}
    }, [reload]);
    const loading = value.key !== key;
    return {...value, items: loading ? [] : value.items, total: loading ? 0 : value.total, detail: loading ? undefined : value.detail,
        merges: loading ? {total: 0, items: []} : value.merges, error: loading ? '' : value.error, loading, busy, actionError, reload, act};
}
