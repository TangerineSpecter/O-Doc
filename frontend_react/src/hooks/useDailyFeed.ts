import {useCallback, useEffect, useRef, useState} from 'react';
import {getDailyFeed} from '../api/agentWorld';
import type {DailyFeedCategory, DailyFeedEvent, DailyFeedResult} from '../types/api/dailyFeed';

const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function shanghaiDay(value = new Date()) {
    const parts = Object.fromEntries(dayFormatter.formatToParts(value).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
}

export function useDailyFeed(actorId: string, category: DailyFeedCategory) {
    const [items, setItems] = useState<DailyFeedEvent[]>([]);
    const [result, setResult] = useState<DailyFeedResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const requestId = useRef(0);
    const active = useRef<AbortController | null>(null);
    const currentQuery = useRef('');

    const reload = useCallback(() => {
        currentQuery.current = '';
        setRevision(value => value + 1);
    }, []);
    const refresh = useCallback(() => setRevision(value => value + 1), []);
    useEffect(() => {
        const id = ++requestId.current;
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        const query = `${category}|${actorId}`;
        const sameQuery = currentQuery.current === query;
        currentQuery.current = query;
        if (!sameQuery) {
            setLoading(true);
            setItems([]);
            setResult(null);
        }
        setError('');
        getDailyFeed({category, actor_id: actorId || undefined}, controller.signal)
            .then(data => {
                if (id !== requestId.current) return;
                setResult(previous => sameQuery && previous?.nextCursor
                    ? {...data, nextCursor: previous.nextCursor, hasMore: previous.hasMore}
                    : data);
                setItems(previous => {
                    if (!sameQuery) return data.items;
                    const latest = new Set(data.items.map(item => item.id));
                    return [...data.items, ...previous.filter(item => !latest.has(item.id))];
                });
            })
            .catch(failure => {
                if (!controller.signal.aborted && id === requestId.current) {
                    setError(failure instanceof Error ? failure.message : '读取每日活动失败');
                }
            })
            .finally(() => {if (id === requestId.current) setLoading(false);});
        return () => {controller.abort();};
    }, [actorId, category, revision]);

    const loadMore = useCallback(async () => {
        if (!result?.nextCursor || loadingMore) return;
        const id = requestId.current;
        active.current?.abort();
        const controller = new AbortController();
        active.current = controller;
        setLoadingMore(true);
        try {
            const next = await getDailyFeed({category, actor_id: actorId || undefined, cursor: result.nextCursor}, controller.signal);
            if (id !== requestId.current || controller.signal.aborted) return;
            setItems(previous => {
                const known = new Set(previous.map(item => item.id));
                return [...previous, ...next.items.filter(item => !known.has(item.id))];
            });
            setResult(next);
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : '加载更多活动失败');
        } finally {
            setLoadingMore(false);
        }
    }, [actorId, category, loadingMore, result]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!loadingMore) refresh();
        }, 30000);
        return () => window.clearInterval(timer);
    }, [loadingMore, refresh]);

    useEffect(() => () => active.current?.abort(), []);

    return {items, result, loading, loadingMore, error, reload, loadMore};
}
