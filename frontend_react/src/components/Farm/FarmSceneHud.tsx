import {CloudRain, Moon, MousePointerClick, Sun, Sunrise, Sunset} from 'lucide-react';
import type {FarmState} from '../../types/api/farm';

/** 农场画布上的浮层信息：主人、天气与时段，以及操作提示。 */
export function FarmSceneHud({farm}: {farm: FarmState}) {
    const {icon: Icon, label} = period(farm.hour, farm.weather);
    return <>
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-white/60 bg-white/90 py-1 pl-1 pr-3 shadow-sm">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Icon size={14}/></span>
            <span className="text-xs font-semibold text-slate-700">{farm.actorName}的农场</span>
            <span className="text-[11px] text-slate-500">{label} · {String(farm.hour).padStart(2, '0')}:00</span>
        </div>
        <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white/90">
            <MousePointerClick size={12}/>点击地块、动物与建筑查看详情
        </span>
    </>;
}

function period(hour: number, weather: FarmState['weather']) {
    if (weather === 'rain') return {icon: CloudRain, label: '雨水滋润大地'};
    if (hour < 5 || hour >= 20) return {icon: Moon, label: '夜深了'};
    if (hour < 7) return {icon: Sunrise, label: '清晨'};
    if (hour >= 17) return {icon: Sunset, label: '傍晚'};
    return {icon: Sun, label: '阳光正好'};
}
