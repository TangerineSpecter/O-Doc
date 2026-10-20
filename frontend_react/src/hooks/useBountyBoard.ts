import {useCallback, useEffect, useRef, useState} from 'react';
import {getBounties, getBountyOptions} from '../api/bounty';
import type {Bounty, BountyOptions, BountyStatus} from '../types/api/bounty';

const ALL: BountyStatus[] = [];

export function useBountyBoard(active: boolean) {
    const [items, setItems] = useState<Bounty[]>([]);
    const [options, setOptions] = useState<BountyOptions | null>(null);
    const [filter, setFilter] = useState<BountyStatus[]>(ALL);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const requestRef = useRef(0);

    const load = useCallback(async (target: number, replace: boolean) => {
        const ticket = ++requestRef.current;
        if (replace) setLoading(true);
        try {
            const result = await getBounties({page: target, status: filter});
            if (ticket !== requestRef.current) return;
            setItems(current => {
                if (!replace) return [...current, ...result.items];
                const details = new Map(current.filter(row => row.invites || row.deliveries).map(row => [row.id, row]));
                return result.items.map(row => {
                    const detail = details.get(row.id);
                    const fresh = detail
                        && detail.inviteAt === row.inviteAt
                        && detail.claimedAt === row.claimedAt
                        && detail.deliveredAt === row.deliveredAt;
                    return fresh ? {...row, invites: detail.invites, deliveries: detail.deliveries} : row;
                });
            });
            setPage(target);
            setHasMore(result.hasMore);
            setError('');
        } catch (e) {
            if (ticket === requestRef.current) setError(e instanceof Error ? e.message : '悬赏加载失败');
        } finally {
            if (ticket === requestRef.current && replace) setLoading(false);
        }
    }, [filter]);

    const reload = useCallback(() => load(1, true), [load]);

    useEffect(() => {
        if (!active) return;
        void reload();
    }, [active, reload]);

    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        void getBountyOptions(controller.signal)
            .then(value => {
                if (!controller.signal.aborted) setOptions(value);
            })
            .catch(e => {
                if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '悬赏选项加载失败');
            });
        return () => controller.abort();
    }, [active]);

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => {
            // 多页浏览时保留已加载内容，避免轮询把列表和滚动位置重置回第一页。
            if (document.visibilityState !== 'visible' || page > 1) return;
            void load(1, true);
        }, 20000);
        return () => window.clearInterval(timer);
    }, [active, load, page]);

    const loadMore = useCallback(() => {
        if (loading || !hasMore) return;
        void load(page + 1, false);
    }, [hasMore, load, loading, page]);

    const changeFilter = useCallback((value: BountyStatus[]) => {
        setFilter(value);
        setPage(1);
    }, []);

    const updateItem = useCallback((bounty: Bounty) => {
        setItems(current => current.map(row => (row.id === bounty.id ? bounty : row)));
    }, []);

    const removeItem = useCallback((id: string) => {
        // 作废在途列表请求，避免轮询把已删除记录写回。
        requestRef.current += 1;
        setLoading(false);
        setItems(current => current.filter(row => row.id !== id));
        // 偏移分页下删除会让后续页边界前移，多页时重新对齐第 1 页避免漏项。
        if (page > 1 || hasMore) void load(1, true);
    }, [page, hasMore, load]);

    return {
        items, options, filter, hasMore, loading, busy, error,
        setError, setBusy, reload, loadMore, changeFilter, updateItem, removeItem,
    };
}
