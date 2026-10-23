import type {LifeItem} from '../../types/api/agentLife';
export function LifeSourceBadge({item}: {item: LifeItem}) {
    return item.source === 'interleaved' ? <span className="inline-flex shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">自由活动</span> : null;
}
export function scheduleCounts(items: LifeItem[]) {
    const idle = items.filter(item => item.source === 'interleaved').length;
    const main = items.filter(item => item.source !== 'interleaved' && !['market', 'market_prepare'].includes(item.activity)).length;
    return `主日程 ${main} · 穿插 ${idle}`;
}
