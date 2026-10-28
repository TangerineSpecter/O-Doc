import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantCampaign} from '../types/api/quantCampaign';
export function useQuantCampaigns(collection: string, offset: number, version: number) {
    const [revision, setRevision] = useState(0), [busy, setBusy] = useState(''), [actionError, setActionError] = useState('');
    const [result, setResult] = useState<{key: string; total: number; items: QuantCampaign[]; error: string}>({key: '', total: 0, items: [], error: ''});
    const key = JSON.stringify([collection, offset, version, revision]);
    const reload = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const abort = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
        const read = async () => {
            if (document.hidden) {timer = setTimeout(() => void read(), 2000); return;}
            try {
                const response = await quantApi.campaigns(collection, offset, abort.signal);
                if (abort.signal.aborted) return;
                setResult({...response, key, error: ''});
                if (response.items.some(row => ['pending', 'running'].includes(row.status))) timer = setTimeout(() => void read(), 2000);
            } catch (cause) {if (!abort.signal.aborted) setResult({key, total: 0, items: [], error: cause instanceof Error ? cause.message : '连续研究加载失败'});}
        };
        void read(); return () => {abort.abort(); clearTimeout(timer);};
    }, [collection, offset, key]);
    const cancel = async (id: string) => {
        setBusy(id); setActionError('');
        try {await quantApi.cancelCampaign(collection, id); reload();}
        catch (cause) {setActionError(cause instanceof Error ? cause.message : '停止失败，请重试');}
        finally {setBusy('');}
    };
    const loading = key !== result.key;
    return {loading, items: loading ? [] : result.items, total: loading ? 0 : result.total, error: loading ? '' : result.error, busy, actionError, reload, cancel};
}
