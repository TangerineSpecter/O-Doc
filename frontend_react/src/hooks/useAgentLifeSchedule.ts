import {useCallback, useEffect, useState} from 'react';
import {getLifeSchedule} from '../api/agentLife';
import type {LifeSchedule} from '../types/api/agentLife';
export function useAgentLifeSchedule(start: string, end: string, actorId: string, status: string, page: number) {
    const [data, setData] = useState<LifeSchedule>({items: [], total: 0, page: 1});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const refresh = useCallback(() => setRevision(v => v + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError('');
        getLifeSchedule({start, end, actorId: actorId || undefined, status: status || undefined, page}, controller.signal)
            .then(value => {if (!controller.signal.aborted) setData(value);})
            .catch(e => {if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '日程加载失败');})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, [start, end, actorId, status, page, revision]);
    useEffect(() => {const timer = window.setInterval(refresh, 30000); return () => window.clearInterval(timer);}, [refresh]);
    return {data, loading, error, refresh};
}
