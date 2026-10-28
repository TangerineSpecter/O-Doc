import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantBatch} from '../types/api/quantIntake';

export function useQuantBatches(collection: string, offset: number) {
    const [revision, setRevision] = useState(0);
    const [result, setResult] = useState<{key: string; total: number; items: QuantBatch[]; error: string}>({key: '', total: 0, items: [], error: ''});
    const key = JSON.stringify([collection, offset, revision]);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        const read = async () => {
            if (document.hidden) {timer = setTimeout(() => void read(), 2000); return;}
            try {
                const response = await quantApi.batches(collection, offset, abort.signal);
                if (abort.signal.aborted) return;
                setResult({...response, key, error: ''});
                if (response.items.some(row => ['pending', 'running'].includes(row.status))) timer = setTimeout(() => void read(), 2000);
            } catch (cause) {
                if (!abort.signal.aborted) setResult(previous => ({...previous, key, error: cause instanceof Error ? cause.message : '批次加载失败'}));
            }
        };
        void read();
        return () => {abort.abort(); clearTimeout(timer);};
    }, [collection, offset, key]);
    const loading = key !== result.key;
    return {loading, items: loading ? [] : result.items, total: loading ? 0 : result.total, error: loading ? '' : result.error, reload};
}
