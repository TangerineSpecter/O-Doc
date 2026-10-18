export const STICKY_TTL_OPTIONS = [
    {value: '3600', label: '1 小时', description: '到期后重新从顺序第一位开始'},
    {value: '7200', label: '2 小时（默认）', description: '第一位中断约两小时时，后续安排沿用已经成功的后面某个模型'},
    {value: '14400', label: '4 小时', description: '更长的故障窗口内，不再每次先等待顺序第一位'},
] as const;

export const DEFAULT_STICKY_TTL_SECONDS = 7200;
export const MAX_DECISION_FAILOVER = 8;

export function formatStickyUntil(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(date);
}

export function stickyTtlValue(seconds: number | undefined): string {
    const candidate = String(seconds ?? DEFAULT_STICKY_TTL_SECONDS);
    return STICKY_TTL_OPTIONS.some(option => option.value === candidate) ? candidate : String(DEFAULT_STICKY_TTL_SECONDS);
}
