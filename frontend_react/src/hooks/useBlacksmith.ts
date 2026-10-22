import {useEffect, useState} from 'react';
import {getBlacksmithHistory, getBlacksmithRecipes} from '../api/blacksmith';
import type {BlacksmithHistory, BlacksmithRecipes} from '../types/api/blacksmith';

export function useBlacksmith(agentId: string, active = true) {
    const [data, setData] = useState<BlacksmithRecipes | null>(null);
    const [history, setHistory] = useState<BlacksmithHistory | null>(null);
    const [page, setPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [resolvedKey, setResolvedKey] = useState('');
    const [error, setError] = useState('');
    const key = `${agentId}:${page}:${revision}`;
    useEffect(() => {
        if (!active) return;
        let controller = new AbortController();
        let pending = false;
        const load = async () => {
            if (document.hidden || pending) return;
            controller.abort();
            controller = new AbortController();
            const {signal} = controller;
            pending = true;
            try {
                const [next, records] = await Promise.all([
                    getBlacksmithRecipes(agentId || undefined, signal),
                    agentId ? getBlacksmithHistory(agentId, page, signal) : Promise.resolve(null),
                ]);
                if (!signal.aborted) {setData(next); setHistory(records); setError(''); setResolvedKey(key);}
            } catch (failure) {
                if (!signal.aborted) {setData(null); setHistory(null); setError(failure instanceof Error ? failure.message : '铁匠铺加载失败'); setResolvedKey(key);}
            } finally {pending = false;}
        };
        void load();
        const timer = window.setInterval(() => {void load();}, 15000);
        const visible = () => {if (document.hidden) controller.abort(); else void load();};
        document.addEventListener('visibilitychange', visible);
        return () => {controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible);};
    }, [agentId, page, key, active]);
    return {data: resolvedKey === key ? data : null, history: resolvedKey === key ? history : null,
        loading: resolvedKey !== key, error: resolvedKey === key ? error : '', page, setPage,
        reload: () => setRevision(value => value + 1)};
}
