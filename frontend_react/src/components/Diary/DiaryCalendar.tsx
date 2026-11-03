import {useState} from 'react';
import {ArrowUpRight, ChevronLeft, ChevronRight, Sparkles} from 'lucide-react';
import type {DiaryEntry} from '../../types/api/diary';
import {countDiaryWords, localDay, parseDiaryDate} from './diaryDate';
import DiaryMoodIcon from './DiaryMoodIcon';

interface Props {
    month: Date;
    onMonth: (month: Date) => void;
    selected: string;
    onSelect: (day: string) => void;
    entries: DiaryEntry[];
    onOpenEntry?: (entry: DiaryEntry) => void;
}

export default function DiaryCalendar({month, onMonth, selected, onSelect, entries, onOpenEntry}: Props) {
    const year = month.getFullYear();
    const m = month.getMonth();
    const count = new Date(year, m + 1, 0).getDate();
    const offset = new Date(year, m, 1).getDay();
    const today = localDay(new Date());

    const days = new Set(entries.map(entry => entry.entryDate));
    const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}`;
    const monthEntries = entries.filter(entry => entry.entryDate.startsWith(monthPrefix));
    const activeEntries = selected ? entries.filter(e => e.entryDate === selected) : monthEntries;
    const activeWords = activeEntries.reduce((sum, e) => sum + countDiaryWords(e.content), 0);

    const [spotlightIdx, setSpotlightIdx] = useState(0);
    const spotlightEntry = entries.length ? entries[spotlightIdx % entries.length] : null;

    return (
        <aside className="space-y-5">
            {/* 现代立体日历卡 (Architectural Calendar) */}
            <div className="diary-art-card p-5 sm:p-6">
                <div className="mb-4 flex items-center justify-between border-b border-zinc-100/80 pb-3.5">
                    <div className="flex items-baseline gap-2">
                        <span className="diary-display-num text-xl font-black text-zinc-900 leading-none">
                            {m + 1}
                        </span>
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                            / {year}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            aria-label="上个月"
                            onClick={() => onMonth(new Date(year, m - 1, 1))}
                            className="rounded-lg border border-zinc-200/60 bg-white/90 p-1.5 text-zinc-600 shadow-2xs transition-all hover:border-zinc-950 hover:bg-zinc-950 hover:text-white"
                        >
                            <ChevronLeft size={14}/>
                        </button>
                        <button
                            type="button"
                            aria-label="下个月"
                            onClick={() => onMonth(new Date(year, m + 1, 1))}
                            className="rounded-lg border border-zinc-200/60 bg-white/90 p-1.5 text-zinc-600 shadow-2xs transition-all hover:border-zinc-950 hover:bg-zinc-950 hover:text-white"
                        >
                            <ChevronRight size={14}/>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-y-2 text-center text-xs">
                    {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                        <span key={d} className="pb-1 text-[11px] font-semibold text-zinc-400">
                            {d}
                        </span>
                    ))}

                    {Array.from({length: offset}, (_, i) => (
                        <span key={`blank${i}`}/>
                    ))}

                    {Array.from({length: count}, (_, i) => {
                        const day = `${year}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                        const hasEntry = days.has(day);
                        const isSelected = selected === day;
                        const isToday = today === day;

                        return (
                            <button
                                type="button"
                                key={day}
                                aria-label={day}
                                aria-pressed={isSelected}
                                onClick={() => onSelect(isSelected ? '' : day)}
                                className={`diary-num relative mx-auto flex h-8 w-8 items-center justify-center rounded-xl text-xs transition-all ${
                                    isSelected
                                        ? 'bg-zinc-950 font-black text-white shadow-sm'
                                        : isToday
                                          ? 'border-2 border-zinc-900 font-bold text-zinc-950'
                                          : hasEntry
                                            ? 'bg-zinc-100/90 font-bold text-zinc-900 hover:bg-zinc-200'
                                            : 'text-zinc-500 hover:bg-zinc-100/50'
                                }`}
                            >
                                {i + 1}
                                {hasEntry && (
                                    <span
                                        className={`absolute bottom-1 h-1 w-1 rounded-full ${
                                            isSelected ? 'bg-white' : 'bg-zinc-900'
                                        }`}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-zinc-100/80 pt-3">
                    <button
                        type="button"
                        onClick={() => {
                            onMonth(new Date());
                            onSelect(today);
                        }}
                        className="text-xs font-semibold text-zinc-700 transition-colors hover:text-black hover:underline"
                    >
                        回到今天
                    </button>
                    {selected && (
                        <button
                            type="button"
                            onClick={() => onSelect('')}
                            className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-900"
                        >
                            显示全月
                        </button>
                    )}
                </div>

                {/* 本月/当日统计微卡片 */}
                <div className="mt-4 rounded-xl border border-black/[0.05] bg-gradient-to-br from-zinc-50/80 to-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                        <span className="font-medium">{selected ? `${selected} 记录` : '本月概览'}</span>
                        <span className="diary-num font-semibold text-zinc-700">{activeWords} 字</span>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                        <p className="text-xl font-extrabold text-zinc-900">
                            {activeEntries.length}{' '}
                            <span className="text-xs font-normal text-zinc-500">篇生活印记</span>
                        </p>
                        {activeEntries.some(e => e.mood) && (
                            <div className="flex -space-x-1.5">
                                {activeEntries
                                    .filter(e => e.mood)
                                    .slice(0, 4)
                                    .map(e => (
                                        <span key={e.diaryId} className="inline-block rounded-full ring-2 ring-white shadow-2xs">
                                            <DiaryMoodIcon mood={e.mood} size={16}/>
                                        </span>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 往日重温小卡片 */}
            {spotlightEntry && onOpenEntry && (
                <div className="diary-art-card p-5">
                    <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-800">
                            <Sparkles size={13} className="text-amber-500"/>
                            往日重温
                        </span>
                        {entries.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setSpotlightIdx(n => (n + 1) % entries.length)}
                                className="text-xs text-zinc-400 transition-colors hover:text-zinc-900 font-medium"
                            >
                                换一篇
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => onOpenEntry(spotlightEntry)}
                        className="group mt-3 block w-full rounded-xl border border-zinc-200/60 bg-white/70 p-3.5 text-left shadow-2xs transition-all hover:border-zinc-400 hover:bg-white hover:shadow-xs"
                    >
                        <p className="text-[11px] font-semibold text-zinc-400">
                            {parseDiaryDate(spotlightEntry.entryDate).fullCn}
                        </p>
                        <h3 className="mt-1 truncate text-sm font-bold text-zinc-900 group-hover:text-black">
                            {spotlightEntry.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                            {spotlightEntry.content}
                        </p>
                        <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-zinc-950">
                            <span>展卷阅读</span>
                            <ArrowUpRight
                                size={12}
                                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            />
                        </span>
                    </button>
                </div>
            )}
        </aside>
    );
}
