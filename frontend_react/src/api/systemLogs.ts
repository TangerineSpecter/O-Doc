import request from '@/utils/request';
import type { LogDetail, LogOverview, LogPage, LogQuery } from '@/types/systemLogs';
const base = '/system/logs/';
export const getLogs = (params: LogQuery) => request.get<never, LogPage>(base, { params });
export const getLogOverview = () => request.get<never, LogOverview>(`${base}overview/`);
export const getLogDetail = (id: string) => request.get<never, LogDetail>(`${base}${id}/`);
export const deleteLogs = (ids: string[]) => request.post<never, LogOverview>(`${base}delete/`, { ids });
export const clearLogs = () => request.post<never, LogOverview>(`${base}clear/`);
export const saveLogPolicy = (days: number, maxMb: number) => request.put<never, LogOverview>(`${base}policy/`, { days, maxMb });
export async function downloadLogs(ids: string[]) {
    const blob = await request.post<never, Blob>(`${base}download/`, { ids }, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = ids.length === 1 ? `exception-${ids[0]}.txt` : 'exceptions.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
