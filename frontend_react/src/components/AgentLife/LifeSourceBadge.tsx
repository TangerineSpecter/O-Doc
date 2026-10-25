import type {LifeItem} from '../../types/api/agentLife';
export function LifeSourceBadge({item}: {item: LifeItem}) {
    if (item.source === 'reservation') return <span className="inline-flex shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">组队预约</span>;
    return item.source === 'interleaved' ? <span className="inline-flex shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">自由活动</span> : null;
}
export function scheduleCounts(items: LifeItem[]) {
    const idle = items.filter(item => item.source === 'interleaved').length;
    const main = items.filter(item => item.source !== 'interleaved' && item.source !== 'reservation' && !['market', 'market_prepare'].includes(item.activity)).length;
    const booked = items.filter(item => item.source === 'reservation').length;
    return `主日程 ${main} · 自由 ${idle}${booked ? ` · 预约 ${booked}` : ''}`;
}
