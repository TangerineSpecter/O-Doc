import {BookOpen, Clock} from 'lucide-react';
import DiaryPhoto from './DiaryPhoto';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import {getMoodLabel, getWeatherLabel} from './diaryBrowse';
import {countDiaryWords, estimateReadingMinutes, formatTimeOnly, parseDiaryDate} from './diaryDate';
import type {DiaryEntry} from '../../types/api/diary';

interface DiaryCardProps {
    entry: DiaryEntry;
    onOpen: () => void;
    timeline?: boolean;
}

export default function DiaryCard({entry, onOpen, timeline = false}: DiaryCardProps) {
    const dateInfo = parseDiaryDate(entry.entryDate);
    const timeStr = formatTimeOnly(entry.createdAt);
    const wordCount = countDiaryWords(entry.content);
    const readMins = estimateReadingMinutes(entry.content);
    const images = entry.imageAssetIds || [];
    const coverId = images[0] || entry.coverAssetId;
    const hasCover = Boolean(coverId || entry.coverUrl);

    return (
        <button
            type="button"
            onClick={onOpen}
            className={`group flex w-full overflow-hidden rounded-2xl border border-zinc-200/70 bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] diary-break-inside-avoid ${
                timeline ? 'flex-col sm:flex-row' : 'mb-4 sm:mb-5 flex-col'
            }`}
        >
            {/* 封面：通栏贴边，无封面时不占位 */}
            {hasCover && (
                <div
                    className={`relative shrink-0 overflow-hidden bg-zinc-100 ${
                        timeline ? 'sm:w-48' : ''
                    }`}
                >
                    <DiaryPhoto
                        assetId={coverId}
                        url={entry.coverUrl}
                        className={`w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] ${
                            timeline ? 'aspect-[16/9] sm:h-full sm:aspect-auto' : 'aspect-[16/9]'
                        }`}
                    />
                    {images.length > 1 && (
                        <span className="diary-num absolute bottom-2 right-2 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                            {images.length} 张
                        </span>
                    )}
                </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col p-3.5 sm:p-4">
                {/* 眼眉：日期 · 星期 · 时间，右侧仅留心情与天气图标 */}
                <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs text-zinc-400">
                    <span className="diary-num truncate tracking-wide">
                        <span className="font-semibold text-zinc-600">
                            {dateInfo.monthPadded}.{dateInfo.dayPadded}
                        </span>
                        {' · '}
                        {dateInfo.weekdayLong}
                        {timeStr && ` · ${timeStr}`}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                        {entry.mood && (
                            <span title={getMoodLabel(entry.mood)}>
                                <DiaryMoodIcon mood={entry.mood} size={15}/>
                            </span>
                        )}
                        {entry.weather && (
                            <span title={getWeatherLabel(entry.weather)}>
                                <WeatherIcon weather={entry.weather} size={13}/>
                            </span>
                        )}
                    </span>
                </div>

                <h3
                    title={entry.title}
                    className="diary-wenkai mt-2 truncate text-[15px] sm:text-base font-bold leading-snug text-zinc-900"
                >
                    {entry.title}
                </h3>

                <p
                    className={`diary-prose diary-wenkai mt-1.5 break-words text-[13px] !leading-relaxed text-zinc-500 ${
                        hasCover ? 'line-clamp-2' : 'line-clamp-4'
                    }`}
                >
                    {entry.content.replace(/^>\s?/gm, '').trim()}
                </p>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-[11px] text-zinc-400">
                    <span className="min-w-0 truncate">
                        {entry.tags.length > 0 ? entry.tags.map(t => `#${t}`).join('  ') : ''}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2.5">
                        <span className="inline-flex items-center gap-1">
                            <BookOpen size={11}/>
                            <span className="diary-num">{wordCount}</span> 字
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <Clock size={11}/>
                            {readMins} 分钟
                        </span>
                    </span>
                </div>
            </div>
        </button>
    );
}
