import {diaryMoods, diaryWeather, type DiaryEntry} from '../../types/api/diary';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import {matchesDiarySelection, type DiaryBrowseSelection} from './diaryBrowse';

interface Props {
    entries: DiaryEntry[];
    selection: DiaryBrowseSelection;
    onChange: (selection: DiaryBrowseSelection) => void;
}

const modes = [
    {value: 'all', label: '全部'},
    {value: 'mood', label: '按心情'},
    {value: 'weather', label: '按天气'},
    {value: 'tags', label: '按标签'},
] as const;

const labels = {all: '', mood: '心情', weather: '天气', tags: '标签'};

export default function DiaryBrowseFilters({entries, selection, onChange}: Props) {
    const options =
        selection.mode === 'mood'
            ? diaryMoods.map(m => ({value: m.value, label: m.label, icon: <DiaryMoodIcon mood={m.value} size={18}/>}))
            : selection.mode === 'weather'
              ? diaryWeather.map(w => ({value: w.value, label: w.label, icon: <WeatherIcon weather={w.value} size={14}/>}))
              : [...new Set(entries.flatMap(entry => entry.tags))]
                    .sort()
                    .map(tag => ({value: tag, label: `#${tag}`, icon: null}));

    return (
        <div className="min-w-0 flex-1 space-y-3.5">
            <div
                aria-label="日记浏览方式"
                className="inline-flex flex-wrap items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100/80 p-1"
            >
                {modes.map(mode => {
                    const active = selection.mode === mode.value;
                    return (
                        <button
                            type="button"
                            key={mode.value}
                            aria-pressed={active}
                            onClick={() => onChange({mode: mode.value, value: ''})}
                            className={`whitespace-nowrap shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                                active
                                    ? 'bg-zinc-950 text-white shadow-xs'
                                    : 'text-zinc-500 hover:bg-white hover:text-zinc-950'
                            }`}
                        >
                            {mode.label}
                        </button>
                    );
                })}
            </div>

            {selection.mode !== 'all' && (
                <div
                    aria-label={`${labels[selection.mode]}筛选`}
                    className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3"
                >
                    {[
                        {value: '', label: `全部${labels[selection.mode]}`, icon: null},
                        ...options,
                        {value: null, label: `未标记${labels[selection.mode]}`, icon: null},
                    ].map(option => {
                        const active = selection.value === option.value;
                        const count = entries.filter(entry =>
                            matchesDiarySelection(entry, {...selection, value: option.value})
                        ).length;
                        return (
                            <button
                                type="button"
                                key={option.value === null ? 'unmarked' : `value:${option.value}`}
                                aria-label={option.label}
                                aria-pressed={active}
                                onClick={() =>
                                    onChange({...selection, value: selection.value === option.value ? '' : option.value})
                                }
                                className={`flex max-w-full items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${
                                    active
                                        ? 'border-zinc-950 bg-zinc-950 text-white'
                                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950 hover:text-zinc-950'
                                }`}
                            >
                                {option.icon}
                                <span className="break-all">{option.label}</span>
                                <span
                                    className={`diary-num rounded-full px-1.5 py-0.2 text-[11px] ${
                                        active ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
                                    }`}
                                >
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
