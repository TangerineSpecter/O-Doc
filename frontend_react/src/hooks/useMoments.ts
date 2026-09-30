import {useCallback, useEffect, useRef, useState} from 'react';
import {getMoments, getSocialInbox} from '../api/social';
import type {Moment, SocialNotification} from '../types/api/social';

export function useMoments(filter: string, actorId: string) {
    const queryKey = filter === 'person' ? `${filter}:${actorId}` : filter;
    const [feedKey, setFeedKey] = useState('');
    const [settledKey, setSettledKey] = useState('');
    const [items, setItems] = useState<Moment[]>([]);
    const [notifications, setNotifications] = useState<SocialNotification[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const generation = useRef(0);
    const hasPaged = useRef(false);
    const active = useRef<AbortController | null>(null);
    const reload = useCallback(async (more = false, quiet = false) => {
        active.current?.abort();
        const controller = new AbortController(); active.current = controller;
        const revision = ++generation.current;
        if (!quiet) setLoading(true);
        try {
            const [feed, inbox] = await Promise.all([
                getMoments({actorId: filter === 'person' ? actorId : undefined, related: filter === 'related' ? '1' : undefined,
                    before: more ? cursor || undefined : undefined}, controller.signal), getSocialInbox(controller.signal),
            ]);
            if (revision !== generation.current || controller.signal.aborted) return;
            hasPaged.current = more;
            setItems(previous => more ? [...previous, ...feed.moments.filter(m => !previous.some(p => p.id === m.id))] : feed.moments);
            setCursor(feed.nextCursor); setNotifications(inbox.items); setError('');
            setFeedKey(queryKey); setSettledKey(queryKey);
        } catch (e) {
            if (revision === generation.current && !controller.signal.aborted) {setError(e instanceof Error ? e.message : '朋友圈加载失败'); setSettledKey(queryKey);}
        } finally {if (revision === generation.current) setLoading(false);}
    }, [filter, actorId, cursor, queryKey]);
    const reloadRef = useRef(reload);
    useEffect(() => {reloadRef.current = reload;}, [reload]);
    useEffect(() => {
        hasPaged.current = false;
        void reloadRef.current();
        // 已翻页时保留已加载内容，用户可以手动刷新获取新动态。
        const timer = window.setInterval(() => {if (document.visibilityState === 'visible' && !hasPaged.current) void reloadRef.current(false, true);}, 30000);
        return () => {window.clearInterval(timer); active.current?.abort();};
    }, [filter, actorId]); // cursor/reload changes do not reset pagination
    return {items: feedKey === queryKey ? items : [], notifications, cursor: feedKey === queryKey ? cursor : null,
        loading: loading || settledKey !== queryKey, error: settledKey === queryKey ? error : '', reload};
}
