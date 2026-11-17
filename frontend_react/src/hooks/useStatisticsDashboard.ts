import {useEffect, useState} from 'react';
import {getStatisticsData} from '../api/stats';
import type {StatsDashboardData} from '../types/api/stats';

export function useStatisticsDashboard(year: number) {
    const [data, setData] = useState<StatsDashboardData | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [pending, setPending] = useState(true);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setPending(true);
        setError(null);
        getStatisticsData(year, controller.signal).then(next => {
            if (!controller.signal.aborted) setData(next);
        }).catch(reason => {
            if (!controller.signal.aborted) setError(reason instanceof Error ? reason : new Error('统计请求失败'));
        }).finally(() => {
            if (!controller.signal.aborted) setPending(false);
        });
        return () => controller.abort();
    }, [year, revision]);
    return {data, error, loading: pending && !data, heatmapLoading: pending && Boolean(data),
        retry: () => setRevision(value => value + 1)};
}
