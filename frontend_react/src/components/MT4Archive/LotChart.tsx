import type { MT4Event } from '../../types/api/mt4Archive';

export function LotChart({ events }: { events: MT4Event[] }) {
    const orders = events.filter(
        (event) =>
            ['buy', 'sell'].includes(event.type?.toLowerCase()) &&
            event.lots?.trim() &&
            Number.isFinite(Number(event.lots)) &&
            Number(event.lots) > 0,
    );
    if (!orders.length) return null;
    const max = orders.reduce((value, event) => Math.max(value, Number(event.lots)), 0);
    const step = Math.max(1, Math.ceil(orders.length / 1000));
    const shown = orders.filter((_, index) => index % step === 0);

    return (
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700">
                    开仓手数分布 · {orders.length} 次{step > 1 ? '（抽样显示）' : ''}
                </span>
                <span>
                    最大开仓手数: <strong className="font-mono text-slate-800">{max}</strong>
                </span>
            </div>
            <svg viewBox="0 0 800 80" className="h-16 w-full" role="img" aria-label="开仓手数图">
                <line x1="20" y1="70" x2="780" y2="70" stroke="#e2e8f0" />
                {shown.map((event, index) => {
                    const height = max > 0 ? (Number(event.lots) / max) * 58 : 0;
                    const isBuy = event.type?.toLowerCase() === 'buy';
                    return (
                        <rect
                            key={`${event.sequence}-${index}`}
                            x={20 + (index * 760) / Math.max(shown.length, 1)}
                            y={70 - height}
                            width={Math.max(1, Math.min(5, 500 / shown.length))}
                            height={Math.max(height, 1)}
                            rx="0.5"
                            fill={isBuy ? '#10b981' : '#f59e0b'}
                            opacity="0.85"
                        >
                            <title>{`${event.time} · ${event.type?.toUpperCase()} · ${event.lots} 手`}</title>
                        </rect>
                    );
                })}
            </svg>
        </div>
    );
}
