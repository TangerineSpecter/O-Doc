import {diaryMoods, diaryWeather, type DiaryDraft} from '../../types/api/diary';
import DiaryMoodIcon from './DiaryMoodIcon';
import {WeatherIcon} from './DiaryMetadata';
import DiaryImageUpload from './DiaryImageUpload';
import DiaryTagsInput from './DiaryTagsInput';

interface Props {
    draft: DiaryDraft;
    onChange: (patch: Partial<DiaryDraft>) => void;
    onUpload: (files: File[]) => void;
    uploading: boolean;
    tagInput: string;
    onTagInputChange: (value: string) => void;
    onlyMetadata?: boolean;
    onlyGallery?: boolean;
}

export default function DiaryDetailsFields({
    draft,
    onChange,
    onUpload,
    uploading,
    tagInput,
    onTagInputChange,
    onlyMetadata = false,
    onlyGallery = false,
}: Props) {
    if (onlyGallery) {
        return <DiaryImageUpload draft={draft} onChange={onChange} onUpload={onUpload} uploading={uploading}/>;
    }

    return (
        <div className="space-y-2">
            {/* 现代微立体属性栏 */}
            <div className="divide-y divide-zinc-150/60 rounded-2xl border border-black/[0.05] bg-gradient-to-b from-zinc-50/80 to-white/90 px-4 py-2 shadow-2xs">
                <fieldset className="py-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <legend className="w-24 shrink-0 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                            今天的心情
                        </legend>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {diaryMoods.map(m => {
                                const active = draft.mood === m.value;
                                return (
                                    <button
                                        type="button"
                                        key={m.value}
                                        aria-label={`心情：${m.label}`}
                                        aria-pressed={active}
                                        onClick={() => onChange({mood: active ? '' : m.value})}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                            active
                                                ? 'border-zinc-950 bg-zinc-950 text-white shadow-2xs'
                                                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
                                        }`}
                                    >
                                        <DiaryMoodIcon mood={m.value} size={18}/>
                                        <span>{m.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </fieldset>

                <fieldset className="py-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <legend className="w-24 shrink-0 text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                            天气
                        </legend>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {diaryWeather.map(w => {
                                const active = draft.weather === w.value;
                                return (
                                    <button
                                        type="button"
                                        key={w.value}
                                        aria-label={`天气：${w.label}`}
                                        aria-pressed={active}
                                        onClick={() => onChange({weather: active ? '' : w.value})}
                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                                            active
                                                ? 'border-zinc-950 bg-zinc-950 text-white shadow-2xs'
                                                : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-950'
                                        }`}
                                    >
                                        <WeatherIcon weather={w.value} size={14}/>
                                        <span>{w.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </fieldset>

                <DiaryTagsInput tags={draft.tags} onChange={tags => onChange({tags})} input={tagInput} onInputChange={onTagInputChange}/>
            </div>

            {!onlyMetadata && (
                <DiaryImageUpload draft={draft} onChange={onChange} onUpload={onUpload} uploading={uploading}/>
            )}
        </div>
    );
}
