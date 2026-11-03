import {Cloud, CloudRain, CloudSnow, CloudSun, Sun, Wind} from 'lucide-react';
import {type DiaryEntry, type DiaryWeather} from '../../types/api/diary';
import {getMoodLabel, getWeatherLabel} from './diaryBrowse';
import DiaryMoodIcon from './DiaryMoodIcon';

const weatherIcons = {sunny: Sun, cloudy: CloudSun, overcast: Cloud, rainy: CloudRain, snowy: CloudSnow, windy: Wind};

export function WeatherIcon({weather, size = 16}: {weather: DiaryWeather; size?: number}) {
    const Icon = weather ? weatherIcons[weather] : Cloud;
    return <Icon size={size} aria-hidden="true" className="shrink-0"/>;
}

interface DiaryMetadataProps {
    entry: Pick<DiaryEntry, 'mood' | 'weather' | 'tags'>;
    variant?: 'card' | 'reader';
    onTagClick?: (tag: string) => void;
}

export default function DiaryMetadata({entry, onTagClick}: DiaryMetadataProps) {
    const moodLabel = getMoodLabel(entry.mood);
    const weatherLabel = getWeatherLabel(entry.weather);

    if (!moodLabel && !weatherLabel && !entry.tags.length) return null;

    return (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {moodLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-zinc-800">
                    <DiaryMoodIcon mood={entry.mood} size={17}/>
                    <span>{moodLabel}</span>
                </span>
            )}
            {weatherLabel && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-zinc-700">
                    <WeatherIcon weather={entry.weather} size={14}/>
                    <span>{weatherLabel}</span>
                </span>
            )}
            {entry.tags.map(tag =>
                onTagClick ? (
                    <button
                        type="button"
                        key={tag}
                        onClick={e => {
                            e.stopPropagation();
                            onTagClick(tag);
                        }}
                        className="max-w-full break-all rounded-full border border-zinc-200 bg-white px-2.5 py-1 font-medium text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-950"
                    >
                        #{tag}
                    </button>
                ) : (
                    <span
                        key={tag}
                        className="max-w-full break-all rounded-full border border-zinc-200/80 bg-zinc-50/80 px-2.5 py-1 text-zinc-600"
                    >
                        #{tag}
                    </span>
                )
            )}
        </div>
    );
}
