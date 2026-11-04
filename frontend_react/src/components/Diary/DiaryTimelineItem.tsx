import {BookOpen, Clock} from 'lucide-react';
import DiaryPhoto from './DiaryPhoto';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import {getMoodLabel, getWeatherLabel} from './diaryBrowse';
import {countDiaryWords, estimateReadingMinutes, formatTimeOnly, parseDiaryDate} from './diaryDate';
import type {DiaryEntry} from '../../types/api/diary';

interface DiaryTimelineItemProps {
    entry: DiaryEntry;
    onOpen: () => void;
}

export default function DiaryTimelineItem({entry, onOpen}: DiaryTimelineItemProps) {
    const dateInfo = parseDiaryDate(entry.entryDate);
    const timeStr = formatTimeOnly(entry.createdAt);
    const wordCount = countDiaryWords(entry.content);
    const readMins = estimateReadingMinutes(entry.content);
    const images = entry.imageAssetIds || [];
    const coverId = images[0] || entry.coverAssetId;
    const hasCover = Boolean(coverId || entry.coverUrl);
    const cleanContent = entry.content
        .replace(/^#+\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .trim();

    return (
        <button
            type="button"
            onClick={onOpen}
            className="group flex w-full items-start gap-3 sm:gap-4 py-3 px-2.5 sm:px-3.5 rounded-xl text-left transition-colors hover:bg-zinc-100/70 active:bg-zinc-200/50"
        >
            {/* 左侧紧凑日期徽标 */}
            <div className="flex flex-col items-center shrink-0 w-11 sm:w-13 pt-0.5 text-center">
                <span className="diary-num text-lg sm:text-2xl font-black text-zinc-900 leading-none">
                    {dateInfo.dayPadded}
                </span>
                <span className="text-[10px] sm:text-[11px] font-medium text-zinc-400 mt-1 leading-tight">
                    {dateInfo.weekdayShort}
                </span>
                {timeStr && (
                    <span className="diary-num text-[9px] text-zinc-400 mt-0.5 leading-tight">
                        {timeStr}
                    </span>
                )}
                {/* 心情与天气微图标 */}
                {(entry.mood || entry.weather) && (
                    <div className="flex items-center gap-1 mt-1.5">
                        {entry.mood && (
                            <span title={getMoodLabel(entry.mood)}>
                                <DiaryMoodIcon mood={entry.mood} size={13}/>
                            </span>
                        )}
                        {entry.weather && (
                            <span title={getWeatherLabel(entry.weather)}>
                                <WeatherIcon weather={entry.weather} size={11}/>
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* 中间标题与正文 */}
            <div className="flex-1 min-w-0">
                <h3 className="diary-wenkai truncate text-sm sm:text-base font-bold text-zinc-900 group-hover:text-black">
                    {entry.title || '无标题日记'}
                </h3>
                <p className="diary-wenkai line-clamp-2 text-xs sm:text-[13px] leading-relaxed text-zinc-500 mt-1">
                    {cleanContent}
                </p>

                {/* 底部标签与字数信息 */}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                    {entry.tags.length > 0 && (
                        <span className="truncate max-w-[140px] sm:max-w-xs text-zinc-400">
                            {entry.tags.map(t => `#${t}`).join(' ')}
                        </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                        <BookOpen size={11}/>
                        <span className="diary-num">{wordCount}</span> 字
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <Clock size={11}/>
                        <span className="diary-num">{readMins}</span> 分钟
                    </span>
                </div>
            </div>

            {/* 右侧小缩略图（若有配图） */}
            {hasCover && (
                <div className="relative shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200/60 shadow-2xs">
                    <DiaryPhoto
                        assetId={coverId}
                        url={entry.coverUrl}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    {images.length > 1 && (
                        <span className="diary-num absolute bottom-1 right-1 rounded-md bg-zinc-950/70 px-1.5 py-0.2 text-[9px] font-medium text-white backdrop-blur-2xs">
                            {images.length}
                        </span>
                    )}
                </div>
            )}
        </button>
    );
}
