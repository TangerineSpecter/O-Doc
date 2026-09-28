import type {TravelConfig} from '../types/api/travel';

export function travelConfigError(config?: TravelConfig): string | undefined {
    if (!config?.collectionId) return '请选择旅行日记的输出文集';
    if (!config.categoryId) return '请选择旅行工作流分类';
    if (!config.searchServerId) return '请选择地方资料搜索服务';
    for (const [value, min, max, label] of [
        [config.nodeMinutes, 1, 60, '节点间隔'],
        [config.recentCities, 0, 30, '避开最近城市数'],
        [config.energyCost, 0, 100, '整趟体力消费'],
    ] as const) {
        if (!Number.isInteger(value) || value < min || value > max) return `${label}须为 ${min} 到 ${max} 之间的整数`;
    }
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function messages(value: unknown, depth = 0): string[] {
    if (depth > 6) return [];
    if (typeof value === 'string') return value.trim() ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(item => messages(item, depth + 1));
    return Object.values(record(value) || {}).flatMap(item => messages(item, depth + 1));
}

export function agentTaskSaveError(error: unknown): string {
    const response = record(record(error)?.response);
    const data = record(response?.data);
    const details = messages(data?.data ?? data?.detail);
    if (details.length) return [...new Set(details)].slice(0, 3).join('；');
    if (typeof data?.msg === 'string' && data.msg) return data.msg;
    if (error instanceof Error && error.message) return error.message;
    return '保存任务失败，请稍后重试';
}
