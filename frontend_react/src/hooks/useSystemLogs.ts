import { useCallback, useEffect, useRef, useState } from 'react';
import { getLogs, getLogOverview, getLogDetail, deleteLogs, clearLogs, saveLogPolicy, downloadLogs } from '@/api/systemLogs';
import type { LogDetail, LogOverview, LogPage, LogQuery } from '@/types/systemLogs';

export function useSystemLogs() {
    const [query, setQuery] = useState<LogQuery>({ page: 1, module: '', q: '' });
    const [page, setPage] = useState<LogPage>({ list: [], total: 0, page: 1, pageSize: 20 });
    const [overview, setOverview] = useState<LogOverview | null>(null);
    const [detail, setDetail] = useState<LogDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState('');
    const sequence = useRef(0);
    const detailSequence = useRef(0);
    const overviewSequence = useRef(0);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const refresh = useCallback(async () => {
        const current = ++sequence.current;
        const overviewCurrent = ++overviewSequence.current;
        setLoading(true); setError('');
        try {
            const [nextPage, nextOverview] = await Promise.all([getLogs(query), getLogOverview()]);
            if (current === sequence.current && mounted.current) { setPage(nextPage); if (overviewCurrent === overviewSequence.current) setOverview(nextOverview); if (query.page > Math.max(1, Math.ceil(nextPage.total / 20))) setQuery(q => ({ ...q, page: Math.max(1, Math.ceil(nextPage.total / 20)) })); }
        } catch (e) { if (current === sequence.current && mounted.current) setError(e instanceof Error ? e.message : '加载失败'); }
        finally { if (current === sequence.current && mounted.current) setLoading(false); }
    }, [query]);
    useEffect(() => {
        // Cancel initialization if the query changes before the request is dispatched.
        const timer = setTimeout(() => { void refresh(); }, 0);
        return () => clearTimeout(timer);
    }, [refresh]);
    useEffect(() => {
        const timer = setInterval(() => {
            const current = ++overviewSequence.current;
            void getLogOverview().then(value => { if (mounted.current && current === overviewSequence.current) setOverview(value); })
                .catch(e => { if (mounted.current && current === overviewSequence.current) setError(e instanceof Error ? e.message : '自动刷新失败'); });
        }, 30000);
        return () => clearInterval(timer);
    }, []);
    const run = async (action: () => Promise<unknown>) => {
        setBusy(true); setError('');
        try { await action(); if (mounted.current) await refresh(); return true; }
        catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '操作失败'); return false; }
        finally { if (mounted.current) setBusy(false); }
    };
    const openDetail = async (id: string) => {
        const current = ++detailSequence.current;
        setDetail(null); setDetailLoading(true); setError('');
        try { const value = await getLogDetail(id); if (current === detailSequence.current && mounted.current) setDetail(value); }
        catch (e) { if (current === detailSequence.current && mounted.current) setError(e instanceof Error ? e.message : '详情加载失败'); }
        finally { if (current === detailSequence.current && mounted.current) setDetailLoading(false); }
    };
    const closeDetail = () => { detailSequence.current++; setDetail(null); setDetailLoading(false); };
    return { query, setQuery, page, overview, detail, detailLoading, loading, busy, error, refresh, openDetail, closeDetail,
        remove: (ids: string[] | null) => run(async () => { if (ids === null) await clearLogs(); else await deleteLogs(ids); closeDetail(); }),
        savePolicy: (days: number, mb: number) => run(() => saveLogPolicy(days, mb)),
        download: (ids: string[]) => run(() => downloadLogs(ids)) };
}
