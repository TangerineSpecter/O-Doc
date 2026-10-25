import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantExperiment} from '../types/api/quantExperiment';
export function useQuantExperiments(collection: string, offset: number, selected: string) {
    const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false), [actionError, setActionError] = useState('');
    const [result, setResult] = useState<{key: string; total: number; items: QuantExperiment[]; detail?: QuantExperiment; error: string}>({key: '', total: 0, items: [], error: ''});
    const key = JSON.stringify([collection, offset, selected, revision]);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        const read = async () => {
            try {
                const response = await quantApi.experiments(collection, offset, abort.signal);
                const id = selected || response.items[0]?.id;
                const detail = id ? await quantApi.experiment(collection, id, abort.signal) : undefined;
                if (abort.signal.aborted) return;
                setResult({key, ...response, detail, error: ''});
                if ((detail && ['pending', 'running'].includes(detail.status)) || response.items.some(row => ['pending', 'running'].includes(row.status) || ['pending', 'running'].includes(row.reviewStatus || '')) || detail?.reviews?.some(row => ['pending', 'running'].includes(row.run.status))) timer = setTimeout(() => void read(), 2000);
            } catch (cause) {if (!abort.signal.aborted) setResult({key, total: 0, items: [], error: cause instanceof Error ? cause.message : '实验加载失败'});}
        };
        void read(); return () => {abort.abort(); clearTimeout(timer);};
    }, [collection, offset, selected, key]);
    const cancel = async (id: string) => {
        setBusy(true); setActionError('');
        try {await quantApi.cancelExperiment(collection, id); reload();}
        catch (cause) {setActionError(cause instanceof Error ? cause.message : '停止失败，请重试');}
        finally {setBusy(false);}
    };
    const loading = key !== result.key;
    return {loading, items: loading ? [] : result.items, total: loading ? 0 : result.total, detail: loading ? undefined : result.detail, error: loading ? '' : result.error, busy, actionError, reload, cancel};
}
