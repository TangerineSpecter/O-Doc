import {useEffect, useState} from 'react';
import axios from 'axios';
import {getResidentAnalytics} from '../api/residentAnalytics';
import type {AnalyticsFilters, ResidentAnalytics, ResidentAnalyticsSourceError} from '../types/api/residentAnalytics';

export function useResidentAnalytics(filters: AnalyticsFilters, refresh: number, valid: boolean) {
    const {start_date, end_date, actor_id} = filters;
    const key = JSON.stringify([start_date, end_date, actor_id, refresh, valid]);
    const [result, setResult] = useState<{key: string; data: ResidentAnalytics | null; error: string; progress?: string} | null>(null);
    useEffect(() => {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const fetchReport = () => {
            getResidentAnalytics({start_date, end_date, actor_id}, controller.signal).then(data => {
                if (controller.signal.aborted) return;
                if ('archivePending' in data) {
                    setResult({key, data: null, error: '', progress: `后台已整理 ${data.readyDays} / ${data.totalDays} 天，完成后自动显示`});
                    timer = setTimeout(fetchReport, 3000);
                } else {
                    setResult({key, data, error: ''});
                }
            }).catch((error: unknown) => {
                const response = axios.isAxiosError<ResidentAnalyticsSourceError>(error) ? error.response : undefined;
                const message = response?.status === 409
                    ? response.data.msg : '居民数据加载失败，请刷新重试';
                if (!controller.signal.aborted) setResult({key, data: null, error: message});
            });
        }
        setResult(null);
        if (valid) fetchReport();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [start_date, end_date, actor_id, key, valid]);
    // A new filter key immediately hides the old data, even before the effect cancels its request.
    const current = valid && result?.key === key;
    return {data: current ? result.data : null, residents: current ? result.data?.residents || [] : [],
        progress: current ? result.progress : null, loading: valid && (!current || Boolean(result.progress)), error: current ? result.error : ''};
}
