import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantGraph} from '../types/api/quantGraph';

export function useQuantGraph(collection: string, focus: string) {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{key: string; data?: QuantGraph; error: string}>({key: '', error: ''});
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const key = JSON.stringify([collection, focus, revision]);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const read = async () => {
            try {
                const data = await quantApi.graph(collection, focus, abort.signal);
                if (abort.signal.aborted) return;
                setResult({key, data, error: ''});
                if (data.index.jobs.some(job => ['pending', 'running'].includes(job.status))) timer = setTimeout(() => void read(), 2000);
            } catch (cause) {
                if (!abort.signal.aborted) setResult({key, error: cause instanceof Error ? cause.message : '图谱加载失败'});
            }
        };
        void read();
        return () => {abort.abort(); clearTimeout(timer);};
    }, [collection, focus, key]);
    const act = async (job?: string) => {
        setBusy(true); setActionError('');
        try {
            if (job) await quantApi.cancelIndex(collection, job);
            else await quantApi.buildIndex(collection);
            reload();
        } catch (cause) {setActionError(cause instanceof Error ? cause.message : '索引操作失败，请重试');}
        finally {setBusy(false);}
    };
    return {data: result.key === key ? result.data : undefined, loading: result.key !== key, error: result.key === key ? result.error : '', actionError, busy, reload, act};
}
