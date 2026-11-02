import {Cloud, CloudRain, CloudSnow, CloudSun, Sun, Wind} from 'lucide-react';
import {diaryMoods, diaryWeather, type DiaryEntry, type DiaryWeather} from '../../types/api/diary';
import DiaryMoodIcon from './DiaryMoodIcon';
const weatherIcons = {sunny: Sun, cloudy: CloudSun, overcast: Cloud, rainy: CloudRain, snowy: CloudSnow, windy: Wind};
export function WeatherIcon({weather}: {weather: DiaryWeather}) {const Icon = weather ? weatherIcons[weather] : Cloud;return <Icon size={17} aria-hidden="true"/>;}
export default function DiaryMetadata({entry}: {entry: Pick<DiaryEntry, 'mood' | 'weather' | 'tags'>}) {
    return <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">
        {entry.mood && <span className="flex items-center gap-1"><DiaryMoodIcon mood={entry.mood} size={22}/>{diaryMoods.find(m => m.value === entry.mood)?.label}</span>}
        {entry.weather && <span className="flex items-center gap-1"><WeatherIcon weather={entry.weather}/>{diaryWeather.find(w => w.value === entry.weather)?.label}</span>}
        {entry.tags.map(tag => <span key={tag} className="max-w-full break-all rounded-full bg-slate-100 px-2 py-1">#{tag}</span>)}
    </div>;
}
