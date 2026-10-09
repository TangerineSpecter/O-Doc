import {useCallback, useEffect, useState} from 'react';
import {getLifeSchedule} from '../api/agentLife';
import type {LifeSchedule} from '../types/api/agentLife';
export function useAgentLifeSchedule(start: string, end: string, actorId: string, status: string, page: number, view: 'week' | 'list' = 'list') {
    const [data, setData] = useState<LifeSchedule>({items: [], total: 0, page: 1});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const requestedPage = view === 'week' ? 1 : page;
    const queryKey = JSON.stringify([start, end, actorId, status, requestedPage, view]);
    const [loadedKey, setLoadedKey] = useState('');
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision(v => v + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError('');
        getLifeSchedule({start, end, actorId: actorId || undefined, status: status || undefined, page: requestedPage, view}, controller.signal)
            .then(value => {if (!controller.signal.aborted) {setData(value); setLoadedKey(queryKey);}})
            .catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '日程加载失败');})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [start, end, actorId, status, requestedPage, view, queryKey, revision]);
    useEffect(() => {const timer = window.setInterval(refresh, 30000); return () => window.clearInterval(timer);}, [refresh]);
    return {data: loadedKey === queryKey ? data : {items: [], total: 0, page: requestedPage}, loading: loading || (loadedKey !== queryKey && !error), error, refresh};
}
