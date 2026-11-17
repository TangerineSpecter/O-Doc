import {useEffect, useReducer, useState} from 'react';
import type {NotificationPage} from '../types/api/message';
import {getNotificationPage, type NotificationStatus} from '../api/message';

interface ListResult {
    status: NotificationStatus;
    revision: number;
    requestedPage: number;
    data: NotificationPage | null;
}

export function useNotificationList(status: NotificationStatus | null, onCount?: (count: number) => void) {
    const [revision, reload] = useReducer((value: number) => value + 1, 0);
    const [selection, select] = useState({status, page: 1});
    const requestedPage = selection.status === status ? selection.page : 1;
    const [result, setResult] = useState<ListResult | null>(null);
    useEffect(() => {
        if (!status) return;
        const controller = new AbortController();
        getNotificationPage(status, requestedPage, controller.signal).then(data => {
            if (controller.signal.aborted) return;
            setResult({status, revision, requestedPage, data});
            onCount?.(data.total);
        }).catch(() => {
            if (!controller.signal.aborted) setResult({status, revision, requestedPage, data: null});
        });
        return () => controller.abort();
    }, [status, revision, requestedPage, onCount]);
    const current = result?.status === status && result.revision === revision && result.requestedPage === requestedPage ? result : null;
    const data = current?.data;
    return {
        rows: data?.items ?? [], total: data?.total, page: data?.page ?? 1, pages: data?.pages ?? 1,
        setPage: (page: number) => select({status, page}),
        loading: Boolean(status && !current), failed: current?.data === null, reload,
    };
}
