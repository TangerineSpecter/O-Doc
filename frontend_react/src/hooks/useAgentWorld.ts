import {useCallback, useEffect, useRef, useState} from 'react';
import {getAgentActivities, getAgentWorldSummary} from '../api/setting';
import type {
    AgentActivity,
    AgentActivityType,
    AgentWorldSummary,
} from '../types/api/setting';

export function useAgentWorld() {
    const [activities, setActivities] = useState<AgentActivity[]>([]);
    const [summary, setSummary] = useState<AgentWorldSummary | null>(null);
    const [type, setType] = useState<AgentActivityType | 'all'>('all');
    const [agentId, setAgentId] = useState('');
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const requestId = useRef(0);
    const loadAbort = useRef<AbortController | null>(null);
    const moreAbort = useRef<AbortController | null>(null);

    const load = useCallback(async (quiet = false) => {
        const currentRequest = ++requestId.current;
        loadAbort.current?.abort();
        if (!quiet) moreAbort.current?.abort();
        const controller = new AbortController();
        loadAbort.current = controller;
        if (!quiet) setLoading(true);
        try {
            const [activityResult, summaryResult] = await Promise.all([
                getAgentActivities({
                    limit: 20,
                    agent: agentId || undefined,
                    type: type === 'all' ? undefined : type,
                }, controller.signal),
                getAgentWorldSummary(controller.signal),
            ]);
            if (currentRequest !== requestId.current) return;
            setActivities(activityResult.items || []);
            setNextCursor(activityResult.nextCursor || null);
            setHasMore(Boolean(activityResult.hasMore));
            setSummary(summaryResult);
            setError('');
        } catch (loadError) {
            if (controller.signal.aborted || currentRequest !== requestId.current) return;
            setError(loadError instanceof Error ? loadError.message : '加载 Agent 世界失败');
        } finally {
            if (loadAbort.current === controller) loadAbort.current = null;
            if (currentRequest === requestId.current && !quiet) setLoading(false);
        }
    }, [agentId, type]);

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMore) return;
        moreAbort.current?.abort();
        const controller = new AbortController();
        moreAbort.current = controller;
        setLoadingMore(true);
        try {
            const result = await getAgentActivities({
                cursor: nextCursor,
                limit: 20,
                agent: agentId || undefined,
                type: type === 'all' ? undefined : type,
            }, controller.signal);
            if (controller.signal.aborted) return;
            setActivities(previous => {
                const known = new Set(previous.map(item => item.id));
                return [...previous, ...(result.items || []).filter(item => !known.has(item.id))];
            });
            setNextCursor(result.nextCursor || null);
            setHasMore(Boolean(result.hasMore));
        } catch (loadError) {
            if (!controller.signal.aborted) {
                setError(loadError instanceof Error ? loadError.message : '加载更多动态失败');
            }
        } finally {
            if (moreAbort.current === controller) {
                moreAbort.current = null;
                setLoadingMore(false);
            }
        }
    }, [agentId, loadingMore, nextCursor, type]);

    useEffect(() => {
        void load();
        return () => {
            requestId.current += 1;
            loadAbort.current?.abort();
            moreAbort.current?.abort();
        };
    }, [load]);

    useEffect(() => {
        const interval = summary?.activeAgentCount ? 5000 : 30000;
        const timer = window.setInterval(() => void load(true), interval);
        return () => window.clearInterval(timer);
    }, [load, summary?.activeAgentCount]);

    return {
        activities,
        summary,
        type,
        setType,
        agentId,
        setAgentId,
        loading,
        loadingMore,
        hasMore,
        error,
        reload: load,
        loadMore,
    };
}
