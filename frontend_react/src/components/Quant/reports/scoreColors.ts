export function scoreColor(score: number | null) {
    if (score === null) return { ring: 'text-slate-600', badge: 'bg-slate-800 text-slate-400 border-slate-700', bar: 'bg-slate-700' };
    if (score >= 4) return { ring: 'text-emerald-400', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', bar: 'bg-emerald-400' };
    if (score >= 3) return { ring: 'text-orange-400', badge: 'bg-orange-500/15 text-orange-300 border-orange-500/30', bar: 'bg-orange-400' };
    return { ring: 'text-amber-400', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', bar: 'bg-amber-400' };
}

