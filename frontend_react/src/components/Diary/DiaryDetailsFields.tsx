import {diaryMoods, diaryWeather, type DiaryDraft} from '../../types/api/diary';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import DiaryImageUpload from './DiaryImageUpload';
import DiaryTagsInput from './DiaryTagsInput';
interface Props {draft: DiaryDraft; onChange: (patch: Partial<DiaryDraft>) => void; onUpload: (files: File[]) => void; uploading: boolean}
export default function DiaryDetailsFields({draft, onChange, onUpload, uploading}: Props) {
    return <div className="space-y-6">
        <fieldset><legend className="mb-3 text-sm font-semibold">今天的心情</legend><div className="grid grid-cols-3 gap-2">{diaryMoods.map(m => <button type="button" key={m.value} aria-label={`心情：${m.label}`} aria-pressed={draft.mood === m.value} onClick={() => onChange({mood: draft.mood === m.value ? '' : m.value})} className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition-colors ${draft.mood === m.value ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><DiaryMoodIcon mood={m.value}/>{m.label}</button>)}</div></fieldset>
        <fieldset><legend className="mb-3 text-sm font-semibold">天气</legend><div className="grid grid-cols-3 gap-2">{diaryWeather.map(w => <button type="button" key={w.value} aria-label={`天气：${w.label}`} aria-pressed={draft.weather === w.value} onClick={() => onChange({weather: draft.weather === w.value ? '' : w.value})} className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs ${draft.weather === w.value ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><WeatherIcon weather={w.value}/>{w.label}</button>)}</div></fieldset>
        <DiaryTagsInput tags={draft.tags} onChange={tags => onChange({tags})}/>
        <DiaryImageUpload draft={draft} onChange={onChange} onUpload={onUpload} uploading={uploading}/>
    </div>;
}
