import {useEffect, useMemo, useState} from 'react';
import {quantApi} from '../api/quant';

/** Explicit, read-only previews belong to one source/report selection; never show stale responses. */
export function useQuantSourceImpact(collection: string, entryId: string, sourceId: string, reportId: string) {
    // Object identity deliberately changes even when A → B → A: the user must
    // explicitly preview again, rather than reopening a prior response or request.
    const selection = useMemo(() => ({collection, entryId, sourceId, reportId}), [collection, entryId, sourceId, reportId]);
    const [requested, setRequested] = useState<{selection: typeof selection; attempt: number} | null>(null);
    const [result, setResult] = useState<{key: number; json: string; error: string}>({key: 0, json: '', error: ''});
    const key = requested?.attempt || 0;
    useEffect(() => {
        if (!requested || requested.selection !== selection || !sourceId || !reportId) return;
        const abort = new AbortController();
        void quantApi.sourceImpact(collection, entryId, sourceId, reportId, abort.signal).then(value => {
            if (!abort.signal.aborted) setResult({key, json: value.impactJson, error: ''});
        }).catch(cause => {if (!abort.signal.aborted) setResult({key, json: '', error: cause instanceof Error ? cause.message : '源码影响预览读取失败'});});
        return () => abort.abort();
    }, [collection, entryId, sourceId, reportId, selection, requested, key]);
    const started = requested?.selection === selection;
    const loading = !!started && result.key !== key;
    return {started, loading, json: started && !loading ? result.json : '', error: started && !loading ? result.error : '',
        preview: () => setRequested(previous => ({selection, attempt: (previous?.attempt || 0) + 1}))};
}
