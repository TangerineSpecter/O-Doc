import {useCallback, useEffect, useRef, useState} from 'react';
import {getFarm, getFarmHistory, getFarms} from '../api/farm';
import type {FarmState, FarmSummary, FarmOperation} from '../types/api/farm';

export function useFarm(initialAgentId = '') {
    const [farms, setFarms] = useState<FarmSummary[]>([]);
    const [agentId, setAgentIdState] = useState(initialAgentId);
    const [farm, setFarm] = useState<FarmState | null>(null);
    const [history, setHistory] = useState<FarmOperation[]>([]);
    const [farmCache, setFarmCache] = useState<Record<string, FarmState>>({});
    const [historyCache, setHistoryCache] = useState<Record<string, FarmOperation[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [retry, setRetry] = useState(0);
    const revision = useRef<string>('');

    const refresh = useCallback(() => {setLoading(true); setError(''); setRetry(v => v + 1);}, []);
    const setAgentId = useCallback((id: string) => {
        setAgentIdState(id);
        setError('');
        const cached = farmCache[id];
        const cachedHist = historyCache[id];
        if (cached) {
            setFarm(cached);
            setHistory(cachedHist || []);
            setLoading(false);
        } else {
            setLoading(true);
        }
    }, [farmCache, historyCache]);

    useEffect(() => {
        const abort = new AbortController();
        getFarms(abort.signal).then(rows => {
            if (abort.signal.aborted) return;
            setFarms(rows);
            setAgentIdState(current => rows.some(r => r.id === current) ? current : rows[0]?.id || '');
            if (!rows.length) setLoading(false);
        }).catch(() => {
            if (!abort.signal.aborted) {
                setError('农场列表加载失败，请重试');
                setLoading(false);
            }
        });
        return () => abort.abort();
    }, [retry]);

    useEffect(() => {
        revision.current = '';
        if (!agentId) return;
        let alive = true;
        let active: AbortController | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;

        async function poll() {
            if (!alive || document.hidden) return;
            active?.abort();
            const abort = new AbortController();
            active = abort;
            try {
                const data = await getFarm(agentId, abort.signal);
                const key = `${data.id}:${data.revision}`;
                const records = revision.current === key ? null : await getFarmHistory(agentId, abort.signal);
                if (!alive || abort.signal.aborted) return;

                setFarmCache(prev => ({...prev, [data.id]: data}));
                if (records) setHistoryCache(prev => ({...prev, [data.id]: records}));

                setFarm(data);
                if (records) setHistory(records);
                revision.current = key;
                setError('');
            } catch {
                if (alive && !abort.signal.aborted) setError('暂时无法更新农场，当前画面保留，稍后自动重试');
            } finally {
                if (alive && !abort.signal.aborted) {
                    setLoading(false);
                    timer = setTimeout(poll, 15000);
                }
            }
        }

        const visibility = () => {clearTimeout(timer); if (document.hidden) active?.abort(); else void poll();};
        document.addEventListener('visibilitychange', visibility);
        void poll();
        return () => {alive = false; active?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility);};
    }, [agentId, retry]);

    const effectiveFarm = (farm?.id === agentId ? farm : farmCache[agentId]) || farm;
    const effectiveHistory = (farm?.id === agentId ? history : historyCache[agentId]) || history;

    return {
        farms,
        agentId,
        setAgentId,
        farm: effectiveFarm,
        history: effectiveHistory,
        loading: loading && !effectiveFarm,
        error,
        refresh
    };
}
