import {Check, Loader2} from 'lucide-react';

export function CatalogEnabledToggle({name, enabled, busy, onToggle}: {name: string; enabled: boolean; busy: boolean; onToggle: () => void}) {
    return <button type="button" role="checkbox" aria-checked={enabled} aria-label={`${name}启用状态`} disabled={busy}
        onClick={event => {event.stopPropagation(); onToggle();}}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${enabled ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin"/> : <span className={`flex h-3 w-3 items-center justify-center rounded-sm border ${enabled ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>{enabled && <Check className="h-2.5 w-2.5"/>}</span>}
        {enabled ? '已启用' : '未启用'}
    </button>;
}
