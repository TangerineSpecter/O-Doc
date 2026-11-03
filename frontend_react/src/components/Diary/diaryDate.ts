import type {DiaryEntry} from '../../types/api/diary';

const WEEKDAYS_SHORT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
const WEEKDAYS_LONG = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;
const MONTHS_CN = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'] as const;
const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export function localDay(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export interface ParsedDiaryDate {
    year: number;
    month: number;
    day: number;
    dayPadded: string;
    monthPadded: string;
    monthCn: string;
    monthEn: string;
    weekdayShort: string;
    weekdayLong: string;
    seasonLabel: string;
    fullCn: string;
    yearMonthKey: string;
}

export function parseDiaryDate(dateStr: string): ParsedDiaryDate {
    const parts = dateStr.split('-').map(Number);
    const year = parts[0] || new Date().getFullYear();
    const month = (parts[1] || 1) - 1;
    const day = parts[2] || 1;
    const dateObj = new Date(year, month, day);
    const weekdayIdx = Number.isNaN(dateObj.getDay()) ? 0 : dateObj.getDay();
    const m = month + 1;
    const seasonLabel = m >= 3 && m <= 5 ? '春日手记' : m >= 6 && m <= 8 ? '夏日手记' : m >= 9 && m <= 11 ? '秋日手记' : '冬日手记';

    return {
        year,
        month: m,
        day,
        dayPadded: String(day).padStart(2, '0'),
        monthPadded: String(m).padStart(2, '0'),
        monthCn: MONTHS_CN[month] || '一月',
        monthEn: MONTHS_EN[month] || 'JAN',
        weekdayShort: WEEKDAYS_SHORT[weekdayIdx],
        weekdayLong: WEEKDAYS_LONG[weekdayIdx],
        seasonLabel,
        fullCn: `${year}年${String(m).padStart(2, '0')}月${String(day).padStart(2, '0')}日`,
        yearMonthKey: `${year}-${String(m).padStart(2, '0')}`,
    };
}

export function formatTimeOnly(isoStr: string): string {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit', hour12: false});
}

export function countDiaryWords(text: string): number {
    if (!text) return 0;
    const cleaned = text.replace(/\s+/g, '');
    return cleaned.length;
}

export function estimateReadingMinutes(text: string): number {
    const count = countDiaryWords(text);
    return Math.max(1, Math.ceil(count / 320));
}

export interface DiaryMonthGroup {
    yearMonth: string;
    year: number;
    month: number;
    monthCn: string;
    monthEn: string;
    entries: DiaryEntry[];
    totalWords: number;
}

export function groupEntriesByMonth(entries: DiaryEntry[]): DiaryMonthGroup[] {
    const map = new Map<string, DiaryMonthGroup>();
    for (const entry of entries) {
        const parsed = parseDiaryDate(entry.entryDate);
        let group = map.get(parsed.yearMonthKey);
        if (!group) {
            group = {
                yearMonth: parsed.yearMonthKey,
                year: parsed.year,
                month: parsed.month,
                monthCn: parsed.monthCn,
                monthEn: parsed.monthEn,
                entries: [],
                totalWords: 0,
            };
            map.set(parsed.yearMonthKey, group);
        }
        group.entries.push(entry);
        group.totalWords += countDiaryWords(entry.content);
    }
    return [...map.values()];
}
