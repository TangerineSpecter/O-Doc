import {fishingSpots} from './spotVisuals';

export const fishingTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '尚未出发';

export const fishingHours = (hours: [number, number][]) => hours.map(([a, b]) =>
    `${String(a).padStart(2, '0')}:00–${String(b).padStart(2, '0')}:00`).join(' / ');

export const fishingSpotLabels: Record<string, string> = Object.fromEntries(Object.entries(fishingSpots).map(([id, spot]) => [id, spot.name]));
