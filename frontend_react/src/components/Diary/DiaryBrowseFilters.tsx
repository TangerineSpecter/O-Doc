import {diaryMoods, diaryWeather, type DiaryEntry} from '../../types/api/diary';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';

import {matchesDiarySelection, type DiaryBrowseSelection} from './diaryBrowse';
interface Props {entries: DiaryEntry[]; selection: DiaryBrowseSelection; onChange: (selection: DiaryBrowseSelection) => void}
const modes = [{value: 'all', label: '全部'}, {value: 'mood', label: '按心情'}, {value: 'weather', label: '按天气'}, {value: 'tags', label: '按标签'}] as const;
const labels = {all: '', mood: '心情', weather: '天气', tags: '标签'};

export default function DiaryBrowseFilters({entries, selection, onChange}: Props) {
    const options = selection.mode === 'mood' ? diaryMoods.map(m => ({value: m.value, label: m.label, icon: <DiaryMoodIcon mood={m.value} size={22}/>}))
        : selection.mode === 'weather' ? diaryWeather.map(w => ({value: w.value, label: w.label, icon: <WeatherIcon weather={w.value}/>}))
            : [...new Set(entries.flatMap(entry => entry.tags))].sort().map(tag => ({value: tag, label: `#${tag}`, icon: null}));
    return <div className="min-w-0 flex-1 space-y-4">
        <div aria-label="日记浏览方式" className="flex flex-wrap gap-2">{modes.map(mode => <button key={mode.value} aria-pressed={selection.mode === mode.value} onClick={() => onChange({mode: mode.value, value: ''})} className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${selection.mode === mode.value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{mode.label}</button>)}</div>
        {selection.mode !== 'all' && <div aria-label={`${labels[selection.mode]}筛选`} className="flex flex-wrap gap-2">{[{value: '', label: `全部${labels[selection.mode]}`, icon: null}, ...options, {value: null, label: `未标记${labels[selection.mode]}`, icon: null}].map(option => <button key={option.value === null ? 'unmarked' : `value:${option.value}`} aria-label={option.label} aria-pressed={selection.value === option.value} onClick={() => onChange({...selection, value: selection.value === option.value ? '' : option.value})} className={`flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${selection.value === option.value ? 'bg-orange-50 text-orange-800' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>{option.icon}<span className="break-all">{option.label}</span><span className="tabular-nums text-slate-500">{entries.filter(entry => matchesDiarySelection(entry, {...selection, value: option.value})).length}</span></button>)}</div>}
    </div>;
}
