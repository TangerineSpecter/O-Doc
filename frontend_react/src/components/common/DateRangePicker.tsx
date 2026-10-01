import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
    calculateTotalDays,
    formatDisplayRange,
    normalizeDateRange,
    PRESETS,
    type DateRange,
    type QuickPreset,
    type QuickPresetKey,
} from '@/utils/dateRangeUtils';

export type { DateRange, QuickPresetKey, QuickPreset };

export interface DateRangePickerProps {
    value?: DateRange | null;
    onChange: (range: DateRange | null) => void;
    placeholder?: string;
    disabled?: boolean;
    buttonClassName?: string;
    align?: 'left' | 'right';
}

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function DateRangePicker({
    value,
    onChange,
    placeholder = '选择日期范围',
    disabled = false,
    buttonClassName = '',
    align = 'left',
}: DateRangePickerProps) {
    const [open, setOpen] = useState(false);
    const [selectingStart, setSelectingStart] = useState<string | null>(null);
    const [hoverDate, setHoverDate] = useState<string | null>(null);
    const [viewMonth, setViewMonth] = useState(() => {
        if (value?.endDate) return dayjs(value.endDate).startOf('month');
        if (value?.startDate) return dayjs(value.startDate).startOf('month');
        return dayjs().startOf('month');
    });

    const triggerRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const popoverId = useId();
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

    const handleOpenToggle = () => {
        if (open) {
            setOpen(false);
            setSelectingStart(null);
            setHoverDate(null);
        } else {
            setSelectingStart(null);
            setHoverDate(null);
            if (value?.endDate) {
                setViewMonth(dayjs(value.endDate).startOf('month'));
            } else if (value?.startDate) {
                setViewMonth(dayjs(value.startDate).startOf('month'));
            } else {
                setViewMonth(dayjs().startOf('month'));
            }
            setOpen(true);
        }
    };

    const handleClose = () => {
        setOpen(false);
        setSelectingStart(null);
        setHoverDate(null);
    };

    useLayoutEffect(() => {
        if (!open || disabled) return;

        const updatePosition = () => {
            const rect = triggerRef.current?.getBoundingClientRect();
            if (!rect) return;

            const popoverWidth = 360;
            const popoverHeight = 460;
            const padding = 12;

            // 垂直方向：默认在下方，空间不足则在上方
            const spaceBelow = window.innerHeight - rect.bottom - padding;
            const spaceAbove = rect.top - padding;
            const placeTop = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

            const top = placeTop
                ? Math.max(padding, rect.top - popoverHeight - 8)
                : Math.min(rect.bottom + 8, window.innerHeight - popoverHeight - padding);

            // 水平方向：对齐 left 或 right
            let left = align === 'right' ? rect.right - popoverWidth : rect.left;
            if (left + popoverWidth > window.innerWidth - padding) {
                left = window.innerWidth - popoverWidth - padding;
            }
            if (left < padding) {
                left = padding;
            }

            setPopoverStyle({
                top: `${top}px`,
                left: `${left}px`,
                position: 'fixed',
                zIndex: 150,
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, disabled, align]);

    useEffect(() => {
        if (!open || disabled) return;

        const handleMouseDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                triggerRef.current?.contains(target) ||
                popoverRef.current?.contains(target)
            ) {
                return;
            }
            handleClose();
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' || event.key === 'Esc') {
                event.stopPropagation();
                handleClose();
            }
        };

        document.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, disabled]);

    const effectiveRange = useMemo(() => {
        if (selectingStart) {
            const end = hoverDate || selectingStart;
            if (dayjs(end).isBefore(dayjs(selectingStart))) {
                return { startDate: end, endDate: selectingStart };
            }
            return { startDate: selectingStart, endDate: end };
        }
        return value || null;
    }, [selectingStart, hoverDate, value]);

    const activePresetKey = useMemo<QuickPresetKey | null>(() => {
        if (!value?.startDate || !value?.endDate || selectingStart) return null;
        for (const preset of PRESETS) {
            const range = preset.getRange();
            if (range.startDate === value.startDate && range.endDate === value.endDate) {
                return preset.key;
            }
        }
        return null;
    }, [value, selectingStart]);

    const totalDays = useMemo(() => {
        return calculateTotalDays(effectiveRange?.startDate, effectiveRange?.endDate);
    }, [effectiveRange]);

    const handleSelectPreset = (preset: QuickPreset) => {
        const range = preset.getRange();
        setSelectingStart(null);
        setHoverDate(null);
        setViewMonth(dayjs(range.endDate).startOf('month'));
        onChange(range);
    };

    const handleDateClick = (dateStr: string) => {
        if (!selectingStart) {
            setSelectingStart(dateStr);
            setHoverDate(null);
        } else {
            const finalRange = normalizeDateRange(selectingStart, dateStr);
            setSelectingStart(null);
            setHoverDate(null);
            onChange(finalRange);
        }
    };

    const handleClear = () => {
        setSelectingStart(null);
        setHoverDate(null);
        onChange(null);
    };

    // 日历网格生成：以周一为一周起始
    const calendarDays = useMemo(() => {
        const startOfMonth = viewMonth.startOf('month');
        const daysInMonth = viewMonth.daysInMonth();
        // 周一至周日：day() 0是周日，1-6是周一至周六
        const firstDayWeekday = (startOfMonth.day() + 6) % 7; // 周一为0，周日为6
        const totalCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;

        const firstGridDate = startOfMonth.subtract(firstDayWeekday, 'day');
        return Array.from({ length: totalCells }, (_, index) => {
            const date = firstGridDate.add(index, 'day');
            const dateStr = date.format('YYYY-MM-DD');
            const isCurrentMonth = date.month() === viewMonth.month();
            const isToday = date.isSame(dayjs(), 'day');

            let isStart = false;
            let isEnd = false;
            let isInRange = false;

            if (effectiveRange?.startDate && effectiveRange?.endDate) {
                isStart = dateStr === effectiveRange.startDate;
                isEnd = dateStr === effectiveRange.endDate;
                const afterStart = date.isAfter(dayjs(effectiveRange.startDate), 'day');
                const beforeEnd = date.isBefore(dayjs(effectiveRange.endDate), 'day');
                isInRange = afterStart && beforeEnd;
            }

            return {
                date,
                dateStr,
                dayNumber: date.date(),
                isCurrentMonth,
                isToday,
                isStart,
                isEnd,
                isInRange,
                isSingleDay: isStart && isEnd,
            };
        });
    }, [viewMonth, effectiveRange]);

    const displayRangeText = formatDisplayRange(value);

    return (
        <div className="relative inline-block">
            <button
                ref={triggerRef}
                type="button"
                disabled={disabled}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={popoverId}
                title={
                    value?.startDate && value?.endDate
                        ? `${value.startDate} 至 ${value.endDate}`
                        : undefined
                }
                onClick={handleOpenToggle}
                className={`group inline-flex w-[180px] items-center justify-between rounded-full border border-blue-200/80 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-blue-400 hover:bg-blue-50/20 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 ${
                    open ? 'border-blue-500 ring-2 ring-blue-500/20' : ''
                } ${buttonClassName}`}
            >
                <span className="flex items-center text-blue-600 shrink-0">
                    <Calendar className="h-3.5 w-3.5" />
                </span>

                <span
                    className={`min-w-0 flex-1 truncate text-center px-1 tracking-tight ${
                        displayRangeText ? 'text-slate-800 font-bold' : 'text-slate-400 font-normal'
                    }`}
                >
                    {displayRangeText || placeholder}
                </span>

                <span className="flex items-center gap-0.5 shrink-0 text-slate-400">
                    {displayRangeText && (
                        <span
                            role="button"
                            tabIndex={0}
                            aria-label="清除日期范围"
                            onClick={e => {
                                e.stopPropagation();
                                handleClear();
                            }}
                            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        >
                            <X className="h-3 w-3" />
                        </span>
                    )}

                    <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform duration-200 group-hover:text-slate-600 ${
                            open ? 'rotate-180 text-blue-600' : ''
                        }`}
                    />
                </span>
            </button>

            {open &&
                !disabled &&
                createPortal(
                    <div
                        ref={popoverRef}
                        id={popoverId}
                        role="dialog"
                        aria-modal="true"
                        aria-label="选择日期区间"
                        style={popoverStyle}
                        className="w-[360px] select-none rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xl shadow-slate-900/10 animate-in fade-in zoom-in-95 duration-150"
                    >
                        <div className="flex items-start justify-between">
                            <div>
                                <h4 className="text-base font-bold text-slate-900 tracking-tight">选择日期区间</h4>
                                <p className="mt-0.5 text-xs text-slate-400">
                                    {selectingStart ? '请在日历中点击选择结束日期' : '点击快捷标签或下方日历选择统计区间'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleClose}
                                aria-label="关闭"
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
                            {PRESETS.map(preset => {
                                const isActive = activePresetKey === preset.key;
                                return (
                                    <button
                                        key={preset.key}
                                        type="button"
                                        onClick={() => handleSelectPreset(preset)}
                                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                                            isActive
                                                ? 'border border-blue-500 bg-blue-50/70 text-blue-600 font-semibold ring-1 ring-blue-500/20'
                                                : 'border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-3.5 flex items-center justify-between rounded-xl border border-blue-100/80 bg-blue-50/50 p-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <div>
                                    <span className="block text-[10px] font-medium text-slate-400">开始日期</span>
                                    <span className="font-mono text-xs font-bold text-slate-800">
                                        {effectiveRange?.startDate || '未选择'}
                                    </span>
                                </div>
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 mx-1" />
                                <div>
                                    <span className="block text-[10px] font-medium text-slate-400">结束日期</span>
                                    <span className="font-mono text-xs font-bold text-slate-800">
                                        {effectiveRange?.endDate || (selectingStart ? '待选择' : '未选择')}
                                    </span>
                                </div>
                            </div>

                            {totalDays > 0 && effectiveRange?.startDate && (
                                <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white shadow-2xs whitespace-nowrap shrink-0">
                                    共 {totalDays} 天
                                </span>
                            )}
                        </div>

                        <div className="mt-3 grid grid-cols-7 gap-1 border-b border-slate-100 pb-1 text-center text-xs font-medium text-slate-400">
                            {WEEK_DAYS.map(day => (
                                <span key={day} className="py-0.5">
                                    {day}
                                </span>
                            ))}
                        </div>

                        <div className="relative mt-2">
                            <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden">
                                <span className="font-sans text-[120px] font-black leading-none text-blue-500/[0.04]">
                                    {viewMonth.month() + 1}
                                </span>
                            </div>

                            <div className="relative mb-2 flex items-center justify-between px-1">
                                <button
                                    type="button"
                                    aria-label="上个月"
                                    onClick={() => setViewMonth(m => m.subtract(1, 'month'))}
                                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-sm font-bold text-slate-800">
                                    {viewMonth.format('YYYY年M月')}
                                </span>
                                <button
                                    type="button"
                                    aria-label="下个月"
                                    onClick={() => setViewMonth(m => m.add(1, 'month'))}
                                    className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="relative grid grid-cols-7 gap-y-1">
                                {calendarDays.map(item => {
                                    const isHighlight = item.isStart || item.isEnd;
                                    const isRangeMiddle = item.isInRange;

                                    return (
                                        <div
                                            key={item.dateStr}
                                            className={`relative flex h-10 items-center justify-center ${
                                                isRangeMiddle
                                                    ? 'bg-blue-50/90 text-blue-600 font-bold'
                                                    : ''
                                            } ${
                                                item.isStart && !item.isSingleDay
                                                    ? 'rounded-l-xl'
                                                    : ''
                                            } ${
                                                item.isEnd && !item.isSingleDay
                                                    ? 'rounded-r-xl'
                                                    : ''
                                            }`}
                                            onMouseEnter={() => {
                                                if (selectingStart) {
                                                    setHoverDate(item.dateStr);
                                                }
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => handleDateClick(item.dateStr)}
                                                className={`flex h-9 w-full flex-col items-center justify-center transition-all ${
                                                    isHighlight
                                                        ? 'bg-blue-600 text-white font-bold shadow-xs ' +
                                                          (item.isSingleDay
                                                              ? 'rounded-xl'
                                                              : item.isStart
                                                              ? 'rounded-l-xl'
                                                              : 'rounded-r-xl')
                                                        : isRangeMiddle
                                                        ? 'text-blue-600 font-bold'
                                                        : item.isToday
                                                        ? 'rounded-xl bg-slate-100 text-slate-800 font-bold ring-1 ring-slate-200'
                                                        : item.isCurrentMonth
                                                        ? 'rounded-xl text-slate-700 font-medium hover:bg-slate-100'
                                                        : 'rounded-xl text-slate-300 font-normal hover:bg-slate-50'
                                                }`}
                                            >
                                                <span className="text-xs leading-none">
                                                    {item.dayNumber}
                                                </span>
                                                {item.isStart && !item.isSingleDay && (
                                                    <span className="mt-0.5 text-[8px] font-normal leading-none opacity-90">
                                                        开始
                                                    </span>
                                                )}
                                                {item.isEnd && !item.isSingleDay && (
                                                    <span className="mt-0.5 text-[8px] font-normal leading-none opacity-90">
                                                        结束
                                                    </span>
                                                )}
                                                {item.isSingleDay && (
                                                    <span className="mt-0.5 text-[8px] font-normal leading-none opacity-90">
                                                        当天
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                            <button
                                type="button"
                                onClick={handleClear}
                                className="text-xs font-medium text-slate-400 transition-colors hover:text-red-600"
                            >
                                清除选择
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-2xs transition-all hover:bg-blue-700 active:scale-95"
                                >
                                    确定
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
        </div>
    );
}
