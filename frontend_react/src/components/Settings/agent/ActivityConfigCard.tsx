import {DecisionProcessInfo} from '../../AgentWorld/DecisionProcessInfo';
import {decisionProcessGuides, type DecisionGuideKind} from '../../AgentWorld/decisionProcessGuides';
import type {ReactNode} from 'react';

export function ActivityConfigCard({title, description, enabled, busy, loading, error, onToggle, onRetry, children, guides = [], icon}: {
    title: string; description: string; enabled: boolean | null; busy: boolean; loading: boolean;
    error: string; onToggle: () => void; onRetry: () => void; children?: ReactNode; guides?: DecisionGuideKind[]; icon?: ReactNode;
}) {
    return <section aria-label={title} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
        <div>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1">{icon}<h4 className="text-xs font-bold text-slate-800">{title}</h4>{guides.length === 1 && <DecisionProcessInfo kind={guides[0]}/>}</div>
                <button type="button" role="switch" aria-label={`启用${title}`} aria-checked={enabled === true}
                    disabled={busy || loading || enabled === null} onClick={onToggle}
                    className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                    {loading ? '加载中…' : busy ? '保存中…' : enabled === null ? '状态未知' : enabled ? '启用中' : '已关闭'}
                </button>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">{description}</p>
            {guides.length > 1 && <div className="mt-2 flex flex-wrap items-center gap-3">{guides.map(kind => <span key={kind} className="flex items-center text-xs text-slate-500">{decisionProcessGuides[kind].title.split(' · ')[0]}流程<DecisionProcessInfo kind={kind}/></span>)}</div>}
            {error && <p role="alert" className="mt-2 text-xs text-red-600">{error} <button type="button" disabled={busy || loading} onClick={onRetry} className="underline">重新加载</button></p>}
        </div>
        {children && <div className="mt-3 border-t border-slate-100 pt-3">{children}</div>}
    </section>;
}
