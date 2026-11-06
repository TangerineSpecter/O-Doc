import {useCallback, useEffect} from 'react';
import {getDatabasePerformance, getPerformanceOverview, getPerformanceRankings, getPerformanceSamples} from '@/api/performance';
import type {PerformanceKind} from '@/types/performance';
import {usePerformanceResource} from './usePerformanceResource';

export function usePerformanceMonitor(hours: number, kind: PerformanceKind, page: number) {
    const overviewFetch = useCallback((signal: AbortSignal) => getPerformanceOverview(hours, signal), [hours]);
    const rankingFetch = useCallback((signal: AbortSignal) => getPerformanceRankings(hours, kind, signal), [hours, kind]);
    const sampleFetch = useCallback((signal: AbortSignal) => getPerformanceSamples(hours, kind, page, signal), [hours, kind, page]);
    const databaseFetch = useCallback((signal: AbortSignal) => getDatabasePerformance(signal), []);
    const overview = usePerformanceResource(String(hours), overviewFetch);
    const rankings = usePerformanceResource(JSON.stringify([hours, kind]), rankingFetch);
    const samples = usePerformanceResource(JSON.stringify([hours, kind, page]), sampleFetch);
    const database = usePerformanceResource('database', databaseFetch, kind === 'sql');
    const {refresh: refreshOverview, reset: resetOverview} = overview;
    const {refresh: refreshRankings, reset: resetRankings} = rankings;
    const {refresh: refreshSamples, reset: resetSamples} = samples;
    const {refresh: refreshDatabase, reset: resetDatabase} = database;
    const refresh = useCallback(async () => {
        await Promise.all([refreshOverview(), refreshRankings(), refreshSamples(), refreshDatabase()]);
    }, [refreshOverview, refreshRankings, refreshSamples, refreshDatabase]);
    const reset = useCallback(() => {
        resetOverview(); resetRankings(); resetSamples(); resetDatabase();
    }, [resetOverview, resetRankings, resetSamples, resetDatabase]);
    useEffect(() => {
        const timer = setInterval(() => {if (!document.hidden) void refresh();}, 30000);
        const updated = () => {void refresh();};
        window.addEventListener('odoc:performance-mock-updated', updated);
        return () => {clearInterval(timer); window.removeEventListener('odoc:performance-mock-updated', updated);};
    }, [refresh]);
    const data = overview.data ? {
        overview: overview.data, rankings: rankings.data?.rows ?? [], samples: samples.data?.rows ?? [],
        total: samples.data?.total ?? 0, database: database.data ?? {status: 'pending', rows: []},
    } : null;
    const errors = [overview.error && '概览', rankings.error && '排行', samples.error && '样本', database.error && '数据库状态'].filter(Boolean);
    return {data, loading: overview.loading || rankings.loading || samples.loading || database.loading,
        rankingsError: rankings.error, samplesError: samples.error, databaseError: database.error,
        rankingsLoading: rankings.loading, samplesLoading: samples.loading, samplesReady: samples.data !== undefined,
        error: errors.length ? `性能数据加载失败：${errors.join('、')}，请重试。` : '',
        partial: !!overview.data?.truncated || !!rankings.data?.truncated, refresh, reset};
}
