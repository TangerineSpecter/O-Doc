import request from '@/utils/request';
import type {DatabasePerformance, PerformanceDetail, PerformanceKind, PerformanceOverview, PerformancePolicy, PerformanceRanking, PerformanceSample} from '@/types/performance';

const base = '/system/performance/';
export const getPerformanceOverview = (hours: number, signal?: AbortSignal) => request.get<never, PerformanceOverview>(`${base}overview/`, {params: {hours}, signal});
export const getPerformanceRankings = (hours: number, kind: PerformanceKind, signal?: AbortSignal) => request.get<never, {rows: PerformanceRanking[]; truncated: boolean}>(`${base}rankings/`, {params: {hours, kind}, signal});
export const getPerformanceSamples = (hours: number, kind: PerformanceKind, page: number, signal?: AbortSignal) => request.get<never, {rows: PerformanceSample[]; total: number; page: number}>(`${base}samples/`, {params: {hours, kind, page}, signal});
export const getPerformanceDetail = (id: string, signal?: AbortSignal) => request.get<never, PerformanceDetail>(`${base}samples/${id}/`, {signal});
export const getDatabasePerformance = (signal?: AbortSignal) => request.get<never, DatabasePerformance>(`${base}database/`, {signal});
export const savePerformancePolicy = (policy: Partial<PerformancePolicy>) => request.put<never, PerformancePolicy>(`${base}policy/`, policy);
export const clearPerformance = () => request.post<never, PerformancePolicy>(`${base}clear/`);
export async function downloadPerformanceReport(id: string, signal?: AbortSignal) {
    const blob = await request.get<never, Blob>(`${base}samples/${id}/report/`, {responseType: 'blob', signal});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `performance-${id}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
