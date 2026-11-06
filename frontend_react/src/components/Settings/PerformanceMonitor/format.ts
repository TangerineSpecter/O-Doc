import type {Percentile, PerformanceKind} from '@/types/performance';
export const kindNames: Record<PerformanceKind, string> = {'': '全部类型', request: '普通接口', stream: '流式响应', sql: 'SQL 执行', ai: '模型调用', task: '后台任务', http: '外部调用'};
export const duration = (value: number | null | undefined) => value == null ? '—' : value < 1000 ? `${value.toFixed(1)} ms` : `${(value / 1000).toFixed(2)} s`;
export const percentage = (value: number | null | undefined) => value == null ? '—' : `${(value * 100).toFixed(1)}%`;
export const quantile = (value: Percentile | null | undefined) => !value ? '—' : value.upperMs == null ? `> ${duration(value.lowerMs)}` : `${duration(value.lowerMs)}–${duration(value.upperMs)}`;
export const statusName = (status: string) => ({success: '成功', failed: '失败', timeout: '超时', cancelled: '已取消', client_error: '请求被拒绝'}[status] || status);
