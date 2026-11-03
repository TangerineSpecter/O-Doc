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
    const moodLabel = getMoodLabel(entry.mood);
    const weatherLabel = getWeatherLabel(entry.weather);
    const images = entry.imageAssetIds || [];
    const hasImages = images.length > 0 || Boolean(entry.coverUrl);

    return (
        <button
            type="button"
            onClick={onOpen}
            className={`diary-art-card group flex w-full flex-col justify-between overflow-hidden p-5 sm:p-6 text-left diary-break-inside-avoid ${
                timeline ? 'w-full' : 'mb-6'
            }`}
        >
            <div className="w-full">
                {/* 顶部元信息：立体建筑感日历印模 + 触感心情天气胶囊 */}
                <div className="flex items-center justify-between gap-3 pb-4">
                    <div className="flex items-center gap-3">
                        {/* 现代日历印模 (Architectural Date Block) */}
                        <div className="diary-date-tile flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl transition-all duration-300 group-hover:shadow-sm group-hover:scale-105">
                            <span className="diary-display-num text-xl sm:text-2xl font-black text-zinc-900 leading-none">
                                {dateInfo.dayPadded}
                            </span>
                            <span className="mt-0.5 text-[10px] font-bold text-zinc-500 tracking-wider leading-none">
                                {dateInfo.month}月
                            </span>
                        </div>

                        {/* 星期与具体时刻 */}
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                                <span>{dateInfo.weekdayLong}</span>
                                {timeStr && (
                                    <>
                                        <span className="text-zinc-300 font-normal">·</span>
                                        <span className="diary-num text-zinc-500 font-normal">{timeStr}</span>
                                    </>
                                )}
                            </div>
                            <span className="mt-0.5 block text-[11px] font-medium text-zinc-400">
                                {dateInfo.year} 年
                            </span>
                        </div>
                    </div>

                    {/* 触感微光胶囊 (心情 & 天气) */}
                    {(moodLabel || weatherLabel) && (
                        <div className="flex items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white/90 px-3 py-1.5 text-xs text-zinc-700 shadow-2xs backdrop-blur-xs transition-transform duration-200 group-hover:border-zinc-300">
                            {entry.mood && (
                                <span className="flex items-center gap-1.5">
                                    <DiaryMoodIcon mood={entry.mood} size={15}/>
                                    <span className="text-[11px] font-medium">{moodLabel}</span>
                                </span>
                            )}
                            {entry.mood && entry.weather && (
                                <span className="text-zinc-200 select-none">/</span>
                            )}
                            {entry.weather && (
                                <span className="flex items-center gap-1.5">
                                    <WeatherIcon weather={entry.weather} size={13}/>
                                    <span className="text-[11px] font-medium">{weatherLabel}</span>
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* 封面相册大片 (如果有配图，作为画报视觉核心) */}
                {hasImages && (
                    <div className="mt-1 mb-4">
                        {images.length <= 1 ? (
                            <div className="diary-photo-frame bg-zinc-100">
                                <DiaryPhoto
                                    assetId={images[0] || entry.coverAssetId}
                                    url={entry.coverUrl}
                                    className="aspect-[16/10] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                                />
                            </div>
                        ) : images.length === 2 ? (
                            <div className="grid grid-cols-2 gap-2">
                                {images.map(id => (
                                    <div key={id} className="diary-photo-frame bg-zinc-100">
                                        <DiaryPhoto
                                            assetId={id}
                                            url=""
                                            className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-2">
                                {images.slice(0, 3).map((id, idx) => (
                                    <div key={id} className="diary-photo-frame relative bg-zinc-100">
                                        <DiaryPhoto
                                            assetId={id}
                                            url=""
                                            className="aspect-square w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                                        />
                                        {idx === 2 && images.length > 3 && (
                                            <span className="diary-num absolute inset-0 flex items-center justify-center bg-zinc-950/60 text-xs font-bold text-white backdrop-blur-[2px]">
                                                +{images.length - 3}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 标题 */}
                <h3 className="break-words text-left text-lg font-bold tracking-tight text-zinc-950 transition-colors duration-200 group-hover:text-black sm:text-[18.5px] leading-snug diary-wenkai">
                    {entry.title}
                </h3>

                {/* 正文摘要：智能清洁后的杂志呼吸排版 */}
                <p
                    className={`mt-2.5 break-words text-left text-[14px] leading-[1.8] text-zinc-600 font-normal diary-prose diary-wenkai ${
                        hasImages ? 'line-clamp-2' : 'line-clamp-4'
                    }`}
                >
                    {entry.content.replace(/^>\s?/gm, '').trim()}
                </p>
            </div>

            {/* 底部信息栏：生活刻度、微标签与字数时长 */}
            <div className="mt-5 flex w-full flex-wrap items-center justify-between gap-2 border-t border-zinc-100/80 pt-3.5 text-xs text-zinc-400">
                <div className="flex flex-wrap items-center gap-1.5">
                    {entry.tags.length > 0 ? (
                        entry.tags.map(tag => (
                            <span
                                key={tag}
                                className="rounded-md bg-zinc-100/80 px-2 py-0.5 text-[11px] font-medium text-zinc-600 transition-colors group-hover:bg-zinc-100"
                            >
                                #{tag}
                            </span>
                        ))
                    ) : (
                        <span className="text-[11px] text-zinc-300">随心随笔</span>
                    )}
                </div>

                <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-medium">
                    <span className="inline-flex items-center gap-1 diary-num">
                        <BookOpen size={11} className="text-zinc-400"/>
                        {wordCount} 字
                    </span>
                    <span className="text-zinc-200">·</span>
                    <span className="inline-flex items-center gap-1">
                        <Clock size={11} className="text-zinc-400"/>
                        {readMins} 分钟
                    </span>
                </div>
            </div>
        </button>
    );
}
