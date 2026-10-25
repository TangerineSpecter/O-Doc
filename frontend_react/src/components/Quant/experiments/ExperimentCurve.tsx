import type {Metric} from './readout';
export function ExperimentCurve({final, baseline, label = '选中方案 · 留出净值'}: {final: Metric; baseline: Metric; label?: string}) {
    const series = [final.curve, baseline.curve];
    if (series.some(points => points.length < 2)) return null;
    const values = series.flat().map(point => point.equity), low = Math.min(...values), high = Math.max(...values), range = high - low || .01;
    const path = (points: Metric['curve']) => points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 500)) === 0 || index === points.length - 1).map(point => {
        const index = points.indexOf(point); return `${24 + index / (points.length - 1) * 660},${180 - (point.equity - low) / range * 140}`;
    }).join(' ');
    return <figure className="space-y-3"><figcaption className="flex flex-wrap gap-4 text-xs text-slate-500"><span className="text-orange-600">● {label}</span><span>● 同成本买入持有</span></figcaption><svg viewBox="0 0 720 220" role="img" aria-label={`${label}与买入持有基线的净值比较`} className="w-full rounded-xl bg-slate-50"><path d="M24 40V180H684" fill="none" stroke="#e2e8f0"/><text x="26" y="26" fontSize="11" fill="#64748b">{high.toFixed(3)}</text><text x="26" y="200" fontSize="11" fill="#64748b">{low.toFixed(3)}</text><polyline points={path(baseline.curve)} fill="none" stroke="#94a3b8" strokeWidth="2"/><polyline points={path(final.curve)} fill="none" stroke="#f97316" strokeWidth="2.5"/></svg><p className="text-xs leading-6 text-slate-400">{final.start} → {final.end} · 开盘区间采样，曲线仅用于本次模拟比较。</p></figure>;
}
