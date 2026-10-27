import type {MT4Event} from '../../types/api/mt4Archive';

export function LotChart({events}: {events: MT4Event[]}) {
    const orders = events.filter(event => ['buy', 'sell'].includes(event.type.toLowerCase()) && event.lots.trim() && Number.isFinite(Number(event.lots)) && Number(event.lots) > 0);
    if (!orders.length) return null;
    const max = orders.reduce((value, event) => Math.max(value, Number(event.lots)), 0);
    const step = Math.max(1, Math.ceil(orders.length / 1000));
    const shown = orders.filter((_, index) => index % step === 0);
    return <div className="mt-4 border-t border-slate-100 pt-4"><p className="mb-2 text-xs text-slate-500">开仓手数 · {orders.length} 次{step > 1 ? '（抽样显示）' : ''}</p><svg viewBox="0 0 800 90" className="h-20 w-full" role="img" aria-label="开仓手数图"><line x1="20" y1="80" x2="780" y2="80" stroke="#e2e8f0"/>{shown.map((event, index) => {const height = Number(event.lots) / max * 65; return <rect key={`${event.sequence}-${index}`} x={20 + index * 760 / Math.max(shown.length, 1)} y={80 - height} width={Math.max(0.7, Math.min(6, 500 / shown.length))} height={height} fill="#65a30d"><title>{`${event.time} · ${event.type} · ${event.lots} 手`}</title></rect>;})}</svg><p className="text-xs text-slate-500">最大开仓手数 {max}</p></div>;
}
