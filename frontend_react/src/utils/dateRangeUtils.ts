import dayjs from 'dayjs';

export interface DateRange {
    startDate: string; // 'YYYY-MM-DD'
    endDate: string;   // 'YYYY-MM-DD'
}

export type QuickPresetKey = 'last7' | 'last30' | 'last90';

export interface QuickPreset {
    key: QuickPresetKey;
    label: string;
    getRange: (referenceDate?: dayjs.Dayjs) => DateRange;
}

export const PRESETS: QuickPreset[] = [
    {
        key: 'last7',
        label: '近 7 天',
        getRange: (ref = dayjs()) => ({
            startDate: ref.subtract(6, 'day').format('YYYY-MM-DD'),
            endDate: ref.format('YYYY-MM-DD'),
        }),
    },
    {
        key: 'last30',
        label: '近 30 天',
        getRange: (ref = dayjs()) => ({
            startDate: ref.subtract(29, 'day').format('YYYY-MM-DD'),
            endDate: ref.format('YYYY-MM-DD'),
        }),
    },
    {
        key: 'last90',
        label: '近 90 天',
        getRange: (ref = dayjs()) => ({
            startDate: ref.subtract(89, 'day').format('YYYY-MM-DD'),
            endDate: ref.format('YYYY-MM-DD'),
        }),
    },
];

/** 同年显示月日，跨年带年份，起止同一天只显示一次。 */
export function formatDisplayRange(range?: DateRange | null, referenceYear = dayjs().year()): string | null {
    if (!range?.startDate || !range?.endDate) return null;
    const start = dayjs(range.startDate);
    const end = dayjs(range.endDate);
    if (!start.isValid() || !end.isValid()) return null;

    if (start.isSame(end, 'day')) {
        return start.year() === referenceYear ? start.format('MM.DD') : start.format('YYYY.MM.DD');
    }

    if (start.year() === referenceYear && end.year() === referenceYear) {
        return `${start.format('MM.DD')} — ${end.format('MM.DD')}`;
    }
    return `${start.format('YYYY.MM.DD')} — ${end.format('YYYY.MM.DD')}`;
}

/**
 * 计算闭合区间的包含天数
 */
export function calculateTotalDays(startDate?: string, endDate?: string): number {
    if (!startDate || !endDate) return 0;
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    if (!start.isValid() || !end.isValid()) return 0;
    const [earlier, later] = start.isAfter(end) ? [end, start] : [start, end];
    return Math.max(1, later.diff(earlier, 'day') + 1);
}

/**
 * 规范化日期范围，保证 startDate <= endDate
 */
export function normalizeDateRange(start: string, end: string): DateRange {
    if (dayjs(end).isBefore(dayjs(start))) {
        return { startDate: end, endDate: start };
    }
    return { startDate: start, endDate: end };
}

/**
 * 精确到日的秒级时间戳转换（00:00:00 到 23:59:59）
 */
export function dateRangeToTimestamps(range?: DateRange | null): { since?: number; until?: number } {
    if (!range?.startDate || !range?.endDate) {
        return { since: undefined, until: undefined };
    }
    const normalized = normalizeDateRange(range.startDate, range.endDate);
    return {
        since: dayjs(normalized.startDate).startOf('day').unix(),
        until: dayjs(normalized.endDate).endOf('day').unix(),
    };
}
