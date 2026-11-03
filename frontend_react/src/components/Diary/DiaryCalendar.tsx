import {useMemo, useState} from 'react';
import {ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, RotateCcw, Sparkles} from 'lucide-react';
import type {DiaryEntry, DiaryMood} from '../../types/api/diary';
import {countDiaryWords, localDay, parseDiaryDate} from './diaryDate';
import {buildDiaryCalendarGrid} from './diaryCalendarGrid';
import DiaryMoodIcon from './DiaryMoodIcon';
import {MOOD_THEMES} from './diaryBrowse';

interface Props {
    month: Date;
    onMonth: (month: Date) => void;
    selected: string;
    onSelect: (day: string) => void;
    entries: DiaryEntry[];
    onOpenEntry?: (entry: DiaryEntry) => void;
}

export default function DiaryCalendar({
    month,
    onMonth,
    selected,
    onSelect,
    entries,
    onOpenEntry,
}: Props) {
    const year = month.getFullYear();
    const m = month.getMonth();
    const today = localDay(new Date());

    // 解析当前月份元信息（包含季节、英文等）
    const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;
    const monthMeta = parseDiaryDate(`${monthPrefix}-01`);
    const isViewingCurrentMonth = today.startsWith(monthPrefix);

    // 按日期组织日记索引
    const entriesByDate = useMemo(() => {
        const map = new Map<string, DiaryEntry[]>();
        for (const entry of entries) {
            const list = map.get(entry.entryDate);
            if (list) {
                list.push(entry);
            } else {
                map.set(entry.entryDate, [entry]);
            }
        }
        return map;
    }, [entries]);

    // 当前月所有日记及统计
    const monthEntries = useMemo(
        () => entries.filter(entry => entry.entryDate.startsWith(monthPrefix)),
        [entries, monthPrefix],
    );
    const monthWords = useMemo(
        () => monthEntries.reduce((sum, e) => sum + countDiaryWords(e.content), 0),
        [monthEntries],
    );
    const monthActiveDaysCount = useMemo(
        () => new Set(monthEntries.map(e => e.entryDate)).size,
        [monthEntries],
    );

    // 统计本月记录的心情
    const monthMoodCounts = useMemo(() => {
        const counts = new Map<DiaryMood, number>();
        for (const entry of monthEntries) {
            if (entry.mood) {
                counts.set(entry.mood, (counts.get(entry.mood) || 0) + 1);
            }
        }
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    }, [monthEntries]);

    // 选中日期的日记与统计
    const selectedEntries = useMemo(
        () => (selected ? entriesByDate.get(selected) || [] : []),
        [entriesByDate, selected],
    );
    const selectedWords = useMemo(
        () => selectedEntries.reduce((sum, e) => sum + countDiaryWords(e.content), 0),
        [selectedEntries],
    );
    const selectedMeta = selected ? parseDiaryDate(selected) : null;

    // 往日重温日记
    const [spotlightIdx, setSpotlightIdx] = useState(0);
    const spotlightEntry = entries.length ? entries[spotlightIdx % entries.length] : null;

    // 计算日历网格（含前后月平滑补齐）
    const calendarGrid = useMemo(() => buildDiaryCalendarGrid(year, m), [year, m]);

    return (
        <aside className="space-y-4">
            {/* 现代杂志风日历卡片 */}
            <div className="diary-art-card p-5 select-none">
                {/* 1. 顶部刊头：年月与导航操作 */}
                <div className="flex items-center justify-between pb-3.5 border-b border-zinc-150/70">
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="diary-wenkai text-2xl font-bold tracking-tight text-zinc-900 leading-none">
                                {m + 1}月
                            </span>
                            <span className="diary-num text-xs font-semibold tracking-wider text-zinc-400">
                                {year}
                            </span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-zinc-400 tracking-wide">
                            {monthMeta.seasonLabel} · {monthMeta.monthEn}
                        </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            title="回到今天"
                            onClick={() => {
                                onMonth(new Date());
                                onSelect(today);
                            }}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                isViewingCurrentMonth && selected === today
                                    ? 'bg-orange-500 text-white shadow-2xs'
                                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900 active:scale-95'
                            }`}
                        >
                            今天
                        </button>
                        <div className="flex items-center rounded-full border border-zinc-200/80 bg-zinc-50/60 p-0.5">
                            <button
                                type="button"
                                aria-label="上个月"
                                onClick={() => onMonth(new Date(year, m - 1, 1))}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 hover:shadow-2xs active:scale-95"
                            >
                                <ChevronLeft size={13} strokeWidth={2.2}/>
                            </button>
                            <button
                                type="button"
                                aria-label="下个月"
                                onClick={() => onMonth(new Date(year, m + 1, 1))}
                                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 hover:shadow-2xs active:scale-95"
                            >
                                <ChevronRight size={13} strokeWidth={2.2}/>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. 星期标头 */}
                <div className="mt-3.5 grid grid-cols-7 text-center">
                    {['日', '一', '二', '三', '四', '五', '六'].map((weekday, idx) => (
                        <span
                            key={weekday}
                            className={`text-[11px] font-medium py-1 ${
                                idx === 0 || idx === 6
                                    ? 'text-orange-500/80 font-semibold'
                                    : 'text-zinc-400'
                            }`}
                        >
                            {weekday}
                        </span>
                    ))}
                </div>

                {/* 3. 日历网格核心矩阵 */}
                <div className="mt-1 grid grid-cols-7 gap-y-1 gap-x-1 text-center">
                    {calendarGrid.map(cell => {
                        const dayEntries = entriesByDate.get(cell.dayStr) || [];
                        const hasEntry = dayEntries.length > 0;
                        const isSelected = selected === cell.dayStr;
                        const isToday = today === cell.dayStr;

                        // 取当天第一篇有心情记录的主题色作为蜡印色彩点
                        const entryWithMood = dayEntries.find(e => e.mood);
                        const moodTheme = entryWithMood ? MOOD_THEMES[entryWithMood.mood] : null;

                        return (
                            <button
                                type="button"
                                key={cell.dayStr}
                                aria-label={`${cell.dayStr}${hasEntry ? '，有记录' : ''}`}
                                aria-pressed={isSelected}
                                onClick={() => {
                                    if (!cell.isCurrentMonth) {
                                        onMonth(cell.targetMonth);
                                    }
                                    onSelect(isSelected ? '' : cell.dayStr);
                                }}
                                className={`group relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-xl text-xs transition-all active:scale-95 ${
                                    isSelected
                                        ? 'bg-zinc-950 font-bold text-white shadow-xs scale-105 z-10 ring-2 ring-zinc-950/20'
                                        : isToday
                                          ? 'bg-orange-50/90 font-bold text-orange-600 ring-1.5 ring-orange-500/80 shadow-2xs'
                                          : hasEntry
                                            ? 'bg-zinc-100/80 font-semibold text-zinc-900 hover:bg-zinc-200/70 hover:shadow-2xs'
                                            : cell.isCurrentMonth
                                              ? 'text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900'
                                              : 'text-zinc-300 hover:text-zinc-500 hover:bg-zinc-50/80'
                                }`}
                            >
                                {/* 日期数字 */}
                                <span className="diary-num leading-none">{cell.dayNum}</span>

                                {/* 印记小点：独立高度空间，绝不与数字重叠粘连 */}
                                <span className="mt-0.5 flex h-1 items-center justify-center">
                                    {hasEntry && (
                                        <span
                                            style={{
                                                backgroundColor: isSelected
                                                    ? '#FFFFFF'
                                                    : moodTheme?.dot || '#18181B',
                                            }}
                                            className={`h-1 w-1 rounded-full transition-transform group-hover:scale-125 ${
                                                isSelected ? 'opacity-95' : 'opacity-85'
                                            }`}
                                        />
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* 4. 底栏：随选择切换的时光看板 */}
                <div className="mt-4 pt-3.5 border-t border-zinc-150/70">
                    {selected ? (
                        /* 状态 A: 选中具体某一天 */
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 font-semibold text-zinc-800">
                                    <span>
                                        {selectedMeta
                                            ? `${selectedMeta.month}月${selectedMeta.day}日 · ${selectedMeta.weekdayShort}`
                                            : selected}
                                    </span>
                                    {selectedEntries.length > 0 && (
                                        <span className="diary-num font-normal text-[11px] text-zinc-400">
                                            ({selectedWords.toLocaleString()} 字)
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onSelect('')}
                                    className="text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-900 hover:underline"
                                >
                                    显示全月
                                </button>
                            </div>

                            {selectedEntries.length > 0 ? (
                                <div className="space-y-1.5">
                                    {selectedEntries.slice(0, 2).map(entry => (
                                        <button
                                            key={entry.diaryId}
                                            type="button"
                                            onClick={() => onOpenEntry?.(entry)}
                                            className="group block w-full rounded-xl border border-zinc-200/70 bg-zinc-50/60 p-2.5 text-left transition-all hover:border-zinc-300 hover:bg-white hover:shadow-xs"
                                        >
                                            <div className="flex items-center justify-between gap-1 text-[11px]">
                                                <div className="flex items-center gap-1.5 truncate">
                                                    {entry.mood && (
                                                        <DiaryMoodIcon mood={entry.mood} size={14}/>
                                                    )}
                                                    <span className="truncate font-bold text-zinc-800 group-hover:text-black">
                                                        {entry.title || '无标题日记'}
                                                    </span>
                                                </div>
                                                <span className="diary-num shrink-0 text-zinc-400">
                                                    {countDiaryWords(entry.content)} 字
                                                </span>
                                            </div>
                                            <p className="mt-1 line-clamp-1 text-[11px] text-zinc-500">
                                                {entry.content}
                                            </p>
                                        </button>
                                    ))}
                                    {selectedEntries.length > 2 && (
                                        <p className="text-center text-[10px] text-zinc-400">
                                            当天另有 {selectedEntries.length - 2} 篇印记
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/40 py-3 text-center">
                                    <p className="text-[11px] text-zinc-400">这一天尚未落笔</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* 状态 B: 全月时光足迹概览 */
                        <div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-zinc-700">本月时光足迹</span>
                                <span className="diary-num font-semibold text-zinc-800">
                                    {monthWords.toLocaleString()} 字
                                </span>
                            </div>

                            <div className="mt-2.5 flex items-center justify-between">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-lg font-black text-zinc-900 leading-none">
                                        {monthEntries.length}
                                    </span>
                                    <span className="text-xs text-zinc-500">
                                        篇印记 · {monthActiveDaysCount} 天记录
                                    </span>
                                </div>

                                {/* 本月情绪走廊 */}
                                {monthMoodCounts.length > 0 ? (
                                    <div className="flex items-center -space-x-1">
                                        {monthMoodCounts.slice(0, 4).map(([mood]) => (
                                            <span
                                                key={mood}
                                                className="inline-block rounded-full ring-2 ring-white shadow-2xs"
                                                title={`本月「${MOOD_THEMES[mood]?.phrase || mood}」`}
                                            >
                                                <DiaryMoodIcon mood={mood} size={18}/>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-[11px] text-zinc-400">期待初次落笔</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 5. 往日重温小卡片 */}
            {spotlightEntry && onOpenEntry && (
                <div className="diary-art-card p-4.5 sm:p-5">
                    <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-800">
                            <Sparkles size={13} className="text-amber-500"/>
                            往日重温
                        </span>
                        {entries.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setSpotlightIdx(n => (n + 1) % entries.length)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 transition-colors hover:text-zinc-900"
                            >
                                <RotateCcw size={10}/>
                                换一篇
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenEntry(spotlightEntry)}
                        className="group mt-3 block w-full rounded-xl border border-zinc-200/60 bg-white/70 p-3.5 text-left shadow-2xs transition-all hover:border-zinc-300 hover:bg-white hover:shadow-xs"
                    >
                        <p className="text-[11px] font-semibold text-zinc-400">
                            {parseDiaryDate(spotlightEntry.entryDate).fullCn}
                        </p>
                        <h3 className="mt-1 truncate text-sm font-bold text-zinc-900 group-hover:text-black">
                            {spotlightEntry.title || '无标题日记'}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                            {spotlightEntry.content}
                        </p>
                        <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-zinc-900 group-hover:text-orange-600 transition-colors">
                            <BookOpen size={11}/>
                            <span>展卷阅读</span>
                            <ArrowUpRight
                                size={11}
                                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            />
                        </span>
                    </button>
                </div>
            )}
        </aside>
    );
}
