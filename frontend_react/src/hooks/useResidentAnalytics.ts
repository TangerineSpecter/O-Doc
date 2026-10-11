import {useEffect, useState} from 'react';
import {getResidentAnalytics} from '../api/residentAnalytics';
import type {AnalyticsFilters, ResidentAnalytics} from '../types/api/residentAnalytics';

export function useResidentAnalytics(filters: AnalyticsFilters, refresh: number, valid: boolean) {
    const {start_date, end_date, actor_id} = filters;
    const key = JSON.stringify([start_date, end_date, actor_id, refresh, valid]);
    const [result, setResult] = useState<{key: string; data: ResidentAnalytics | null; error: string} | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        if (valid) {
            getResidentAnalytics({start_date, end_date, actor_id}, controller.signal).then(data => {
                if (!controller.signal.aborted) setResult({key, data, error: ''});
            }).catch(() => {
                if (!controller.signal.aborted) setResult({key, data: null, error: '居民数据加载失败，请刷新重试'});
            });
        }
        return () => controller.abort();
    }, [start_date, end_date, actor_id, key, valid]);
    // A new filter key immediately hides the old data, even before the effect cancels its request.
    const current = valid && result?.key === key;
    return {data: current ? result.data : null, residents: result?.data?.residents || [],
        loading: valid && !current, error: current ? result.error : ''};
}
