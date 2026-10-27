import type {MT4Event} from '../../types/api/mt4Archive';

export function BalanceChart({events, initialBalance}: {events: MT4Event[]; initialBalance?: string}) {
    const closes = events.filter(event => event.balance.trim() && Number.isFinite(Number(event.balance))).map(event => ({event, value: Number(event.balance)}));
    if (!closes.length) return <p className="text-sm text-slate-500">没有平仓余额数据，无法重建曲线。</p>;
    const points = initialBalance?.trim() && Number.isFinite(Number(initialBalance)) ? [{event: {...closes[0].event, sequence: 'start', time: '回测开始', order: '—', profit: '', balance: initialBalance}, value: Number(initialBalance)}, ...closes] : closes;
    const {min, max} = points.reduce((range, point) => ({min: Math.min(range.min, point.value), max: Math.max(range.max, point.value)}), {min: Infinity, max: -Infinity});
    const span = max - min || 1;
    // Keep each bucket's high and low in their original order so large reports
    // remain responsive without hiding local extremes.
    const bucketSize = Math.max(1, Math.ceil(points.length / 1500));
    const selected: number[] = [];
    for (let start = 0; start < points.length; start += bucketSize) {
        const end = Math.min(points.length, start + bucketSize);
        let low = start, high = start;
        for (let i = start + 1; i < end; i++) {if (points[i].value < points[low].value) low = i; if (points[i].value > points[high].value) high = i;}
        for (const i of [...new Set([start, low, high, end - 1])].sort((a, b) => a - b)) selected.push(i);
    }
    const x = (index: number) => points.length === 1 ? 20 : 20 + index * 760 / (points.length - 1);
    const coordinates = selected.map(index => `${x(index)},${180 - (points[index].value - min) * 150 / span}`).join(' ');
    return <div>
        <p className="mb-2 text-xs text-slate-500">根据平仓余额重建；横轴为平仓事件顺序，不含持仓浮动净值。{bucketSize > 1 ? '数据较多时曲线抽样并保留各段高低点。' : ''}</p>
        <svg viewBox="0 0 800 210" className="h-48 w-full" role="img" aria-label="平仓余额变化曲线">
            <line x1="20" x2="780" y1="180" y2="180" stroke="#e2e8f0"/>
            <polyline points={coordinates} fill="none" stroke="#ea580c" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
            {selected.length < 500 && selected.map(index => <circle key={`${points[index].event.sequence}-${index}`} cx={x(index)} cy={180 - (points[index].value - min) * 150 / span} r="4" fill="transparent"><title>{`${points[index].event.time} · 订单 ${points[index].event.order} · 盈亏 ${points[index].event.profit || '—'} · 余额 ${points[index].event.balance}`}</title></circle>)}
        </svg>
        <div className="flex justify-between text-xs text-slate-500"><span>最低 {min.toFixed(2)}</span><span>最高 {max.toFixed(2)}</span></div>
    </div>;
}
