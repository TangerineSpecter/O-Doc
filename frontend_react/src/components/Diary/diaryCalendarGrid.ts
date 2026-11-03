import {localDay} from './diaryDate';

export interface CalendarGridCell {
    dayNum: number;
    dayStr: string;
    isCurrentMonth: boolean;
    targetMonth: Date;
}

/**
 * 构建完整的周对齐日历矩阵（包含前后月平滑补齐）
 * 每周 7 列（周日到周六），总长度必为 7 的整数倍（35 或 42 格）
 */
export function buildDiaryCalendarGrid(year: number, monthIndex: number): CalendarGridCell[] {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startWeekday = new Date(year, monthIndex, 1).getDay(); // 0 是周日
    const prevMonthLastDay = new Date(year, monthIndex, 0).getDate();
    const monthPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    const currentMonthDate = new Date(year, monthIndex, 1);

    // 上个月补齐天数
    const prevCells: CalendarGridCell[] = Array.from({length: startWeekday}, (_, i) => {
        const dayNum = prevMonthLastDay - startWeekday + 1 + i;
        const prevDate = new Date(year, monthIndex - 1, dayNum);
        return {
            dayNum,
            dayStr: localDay(prevDate),
            isCurrentMonth: false,
            targetMonth: new Date(year, monthIndex - 1, 1),
        };
    });

    // 当月天数
    const currentCells: CalendarGridCell[] = Array.from({length: daysInMonth}, (_, i) => {
        const dayNum = i + 1;
        const dayStr = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
        return {
            dayNum,
            dayStr,
            isCurrentMonth: true,
            targetMonth: currentMonthDate,
        };
    });

    // 下个月补齐天数（保证完整周）
    const filledCount = prevCells.length + currentCells.length;
    const remainder = filledCount % 7;
    const nextCount = remainder === 0 ? 0 : 7 - remainder;
    const nextCells: CalendarGridCell[] = Array.from({length: nextCount}, (_, i) => {
        const dayNum = i + 1;
        const nextDate = new Date(year, monthIndex + 1, dayNum);
        return {
            dayNum,
            dayStr: localDay(nextDate),
            isCurrentMonth: false,
            targetMonth: new Date(year, monthIndex + 1, 1),
        };
    });

    return [...prevCells, ...currentCells, ...nextCells];
}
