import type {Percentile, PerformanceKind} from '@/types/performance';

export const kindNames: Record<PerformanceKind, string> = {
    '': '全部类型',
    request: '普通接口',
    stream: '流式响应',
    sql: 'SQL 执行',
    ai: '模型调用',
    task: '后台任务',
    http: '外部调用'
};

export const duration = (value: number | null | undefined) =>
    value == null ? '—' : value < 1000 ? `${value.toFixed(1)} ms` : `${(value / 1000).toFixed(2)} s`;

export const percentage = (value: number | null | undefined) =>
    value == null ? '—' : `${(value * 100).toFixed(1)}%`;

export const quantile = (value: Percentile | null | undefined) =>
    !value ? '—' : value.upperMs == null ? `> ${duration(value.lowerMs)}` : `${duration(value.lowerMs)}–${duration(value.upperMs)}`;

export const statusName = (status: string) =>
    ({success: '成功', failed: '失败', timeout: '超时', cancelled: '已取消', client_error: '请求被拒绝'}[status] || status);

export const statusBadge = (status: string) => {
    switch (status) {
        case 'success':
            return {label: '成功', className: 'bg-lime-50 text-lime-700 border-lime-200/80'};
        case 'failed':
            return {label: '失败', className: 'bg-red-50 text-red-700 border-red-200/80'};
        case 'timeout':
            return {label: '超时', className: 'bg-amber-50 text-amber-700 border-amber-200/80'};
        case 'cancelled':
            return {label: '已取消', className: 'bg-slate-100 text-slate-600 border-slate-200'};
        case 'client_error':
            return {label: '拒绝', className: 'bg-orange-50 text-orange-700 border-orange-200/80'};
        default:
            return {label: status, className: 'bg-slate-50 text-slate-600 border-slate-200'};
    }
};

export const methodBadge = (method?: string) => {
    switch (method?.toUpperCase()) {
        case 'GET':
            return 'bg-blue-50 text-blue-700 border-blue-200/70';
        case 'POST':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200/70';
        case 'PUT':
            return 'bg-amber-50 text-amber-700 border-amber-200/70';
        case 'DELETE':
            return 'bg-red-50 text-red-700 border-red-200/70';
        case 'PATCH':
            return 'bg-purple-50 text-purple-700 border-purple-200/70';
        default:
            return 'bg-slate-100 text-slate-600 border-slate-200/70';
    }
};

