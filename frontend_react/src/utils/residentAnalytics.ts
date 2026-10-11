import type {AnalyticsComparison} from '../types/api/residentAnalytics';

export type AnalyticsPeriod = '7' | '30' | 'custom';
export type ComparisonColumn = 'activeDays' | 'publications' | 'interactions' | 'income' | 'expense' | 'net';

export function analyticsRange(days: number, now = new Date()) {
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'}).format(now);
    const first = new Date(`${today}T00:00:00Z`);
    first.setUTCDate(first.getUTCDate() - days + 1);
    return {start_date: first.toISOString().slice(0, 10), end_date: today};
}

export function analyticsRangeError(start: string, end: string) {
    if (!start || !end) return '请选择起止日期';
    const first = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) return '开始日期不能晚于结束日期';
    if ((last - first) / 86400000 >= 366) return '日期范围最多 366 天';
    return '';
}

function cents(value: string) {
    const negative = value.startsWith('-');
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return BigInt(whole) * (negative ? -100n : 100n) + BigInt(fraction.padEnd(2, '0')) * (negative ? -1n : 1n);
}

export function analyticsMoney(value: string) {
    const [whole, fraction = '00'] = value.split('.');
    return `¥${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

export function sortAnalyticsResidents(rows: AnalyticsComparison[], column: ComparisonColumn, descending: boolean) {
    return [...rows].sort((left, right) => {
        const a = left[column], b = right[column];
        const difference = typeof a === 'string' && typeof b === 'string' ? cents(a) - cents(b) : Number(a) - Number(b);
        return (difference < 0 ? -1 : difference > 0 ? 1 : 0) * (descending ? -1 : 1) || left.id.localeCompare(right.id);
    });
}
