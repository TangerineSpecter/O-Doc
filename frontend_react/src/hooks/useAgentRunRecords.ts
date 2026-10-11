import {useCallback, useEffect, useRef, useState} from 'react';
import {getAgentRunRecord, getAgentRunRecords} from '../api/setting';
import type {AgentRunRecordConfig} from '../api/setting';

interface RecordState {
    records: AgentRunRecordConfig[];
    nextCursor: string | null;
    hasMore: boolean;
    loading: boolean;
    error: string;
}

const initialState: RecordState = {records: [], nextCursor: null, hasMore: true, loading: true, error: ''};

export function useAgentRunRecords() {
    const [state, setState] = useState(initialState);
    const current = useRef(initialState);
    const initialized = useRef(false);
    const request = useRef<AbortController | null>(null);
    const refreshError = useRef(false);

    const update = useCallback((patch: Partial<RecordState>) => {
        current.current = {...current.current, ...patch};
        setState(current.current);
    }, []);

    const fetchPage = useCallback(async (refresh = false) => {
        if (request.current || (!refresh && !current.current.hasMore)) return;
        const controller = new AbortController();
        request.current = controller;
        const append = !refresh && initialized.current;
        update({loading: true, error: ''});
        try {
            const page = await getAgentRunRecords({limit: 20, cursor: append ? current.current.nextCursor || undefined : undefined}, controller.signal);
            const previous = current.current.records;
            // Only keep loaded history when the new first page connects to it.
            // Otherwise the old cursor would skip the gap between these pages.
            const preserveHistory = refresh && page.hasMore && page.items.some(record => previous.some(item => item.id === record.id));
            // Refresh older running rows too, without requesting all historical pages again.
            const running = preserveHistory ? previous.filter(record => record.status === 'running' && !page.items.some(item => item.id === record.id)) : [];
            const updatedRuns = await Promise.all(running.map(record => getAgentRunRecord(record.id, controller.signal)));
            if (controller.signal.aborted) return;
            const updates = new Map([...page.items, ...updatedRuns].map(record => [record.id, record]));
            const records = append
                ? [...previous, ...page.items.filter(record => !previous.some(item => item.id === record.id))]
                : preserveHistory
                    ? [...page.items, ...previous.filter(record => !page.items.some(item => item.id === record.id)).map(record => updates.get(record.id) || record)]
                    : page.items;
            update({records, loading: false, error: '', ...(preserveHistory ? {} : {nextCursor: page.nextCursor, hasMore: page.hasMore})});
            initialized.current = true;
        } catch {
            if (!controller.signal.aborted) {
                refreshError.current = refresh;
                update({loading: false, error: refresh ? '执行状态刷新失败' : '执行记录加载失败'});
            }
        } finally {
            if (request.current === controller) request.current = null;
        }
    }, [update]);

    const loadMore = useCallback(() => fetchPage(), [fetchPage]);
    const refresh = useCallback(() => fetchPage(true), [fetchPage]);
    const retry = useCallback(() => fetchPage(refreshError.current), [fetchPage]);

    useEffect(() => {
        void loadMore();
        return () => {
            request.current?.abort();
            request.current = null;
        };
    }, [loadMore]);

    const hasRunning = state.records.some(record => record.status === 'running');
    useEffect(() => {
        if (!hasRunning) return;
        const timer = window.setInterval(() => {void refresh();}, 3000);
        return () => window.clearInterval(timer);
    }, [hasRunning, refresh]);

    return {...state, loadMore, refresh, retry};
}

export type AgentRunRecordFeed = ReturnType<typeof useAgentRunRecords>;
