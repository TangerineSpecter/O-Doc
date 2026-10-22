export const fishingTime = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : '尚未出发';

export const fishingHours = (hours: [number, number][]) => hours.map(([a, b]) =>
    `${String(a).padStart(2, '0')}:00–${String(b).padStart(2, '0')}:00`).join(' / ');

export const fishingSpotLabels: Record<string, string> = {pond: '青苇池塘', river: '流光河湾', lake: '镜月湖畔'};
