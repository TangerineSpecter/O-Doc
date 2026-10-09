import {useEffect, useState} from 'react';
import {getCookingRecipes, getCookingHistory} from '../api/cooking';
import type {CookingRecipes, CookingHistory} from '../types/api/cooking';

export function useCooking(agentId: string) {
    const [data, setData] = useState<CookingRecipes | null>(null);
    const [history, setHistory] = useState<CookingHistory | null>(null);
    const [page, setPage] = useState(1);
    const [resolvedKey, setResolvedKey] = useState('');
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    const requestKey = `${agentId}:${page}:${version}`;
    useEffect(() => {
        let controller = new AbortController();
        let pending = false;
        const load = async () => {
            if (document.hidden || pending) return;
            controller.abort(); controller = new AbortController();
            const signal = controller.signal;
            pending = true;
            try {
                const [next, records] = await Promise.all([getCookingRecipes(agentId || undefined, signal),
                    agentId ? getCookingHistory(agentId, page, signal) : Promise.resolve(null)]);
                if (!signal.aborted) {setData(next); setHistory(records); setError(''); setResolvedKey(requestKey);}
            } catch (e) {
                if (!signal.aborted) {setError(e instanceof Error ? e.message : '食谱加载失败'); setResolvedKey(requestKey); setData(null); setHistory(null);}
            } finally {pending = false;}
        };
        void load();
        const timer = window.setInterval(() => {void load();}, 15000);
        const visible = () => {if (document.hidden) controller.abort(); else void load();};
        document.addEventListener('visibilitychange', visible);
        return () => {controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible);};
    }, [agentId, page, requestKey]);
    return {data: resolvedKey === requestKey ? data : null, history: resolvedKey === requestKey ? history : null, page, setPage, loading: resolvedKey !== requestKey, error: resolvedKey === requestKey ? error : '', reload: () => setVersion(v => v + 1)};
}
