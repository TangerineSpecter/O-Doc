import {useEffect, useState} from 'react';
import {useEscapeDismissal} from '../../../hooks/useEscapeDismissal';
import type {SyncConflict} from './types';

interface SyncConflictModalProps {
    conflicts: SyncConflict[];
    total: number;
    busy: boolean;
    onClose: () => void;
    onConfirm: (picks: Record<string, 'local' | 'remote'>, resolutionDefault?: 'local' | 'remote') => Promise<void>;
}

export const SyncConflictModal = ({conflicts, total, busy, onClose, onConfirm}: SyncConflictModalProps) => {
    const open = conflicts.length > 0 || total > 0;
    const [picks, setPicks] = useState<Record<string, 'local' | 'remote'>>({});
    useEscapeDismissal(open, () => { if (!busy) onClose(); });
    useEffect(() => {
        const next: Record<string, 'local' | 'remote'> = {};
        for (const item of conflicts) next[item.key] = item.suggested === 'local' ? 'local' : 'remote';
        setPicks(next);
    }, [conflicts]);
    if (!open) return null;
    const hidden = Math.max(0, total - conflicts.length);
    return (
        <div data-modal-scroll-lock className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => { if (!busy) onClose(); }} />
            <section role="dialog" aria-modal="true" aria-label="逐条选择同步结果" className="relative flex max-h-[85dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
                <header className="border-b border-slate-100 px-6 py-4">
                    <h3 className="text-lg font-bold text-slate-900">两端都改过这些记录</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">选择保留本机还是云端。只出现在一侧的记录会自动保留。自动生成的居民记忆仍随整理进度整组采用，不在这里拆开。</p>
                </header>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-hide px-6 py-4">
                    {conflicts.map(item => (
                        <article key={item.key} className="rounded-xl border border-slate-200 p-3">
                            <p className="text-[11px] text-slate-400">{item.model}</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <Choice label="本机" text={item.label} at={item.localAt} active={picks[item.key] === 'local'} onClick={() => setPicks(current => ({...current, [item.key]: 'local'}))} />
                                <Choice label="云端" text={item.remoteLabel} at={item.remoteAt} active={picks[item.key] === 'remote'} onClick={() => setPicks(current => ({...current, [item.key]: 'remote'}))} />
                            </div>
                        </article>
                    ))}
                    {hidden > 0 && <p className="text-xs text-slate-500">还有 {hidden} 条未列出。不点“全部用某一侧”时，这些记录用较新的一侧。</p>}
                </div>
                <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
                    <button type="button" disabled={busy} onClick={onClose} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">取消</button>
                    <button type="button" disabled={busy} onClick={() => void onConfirm({}, 'local')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">全部用本机</button>
                    <button type="button" disabled={busy} onClick={() => void onConfirm({}, 'remote')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">全部用云端</button>
                    <button type="button" disabled={busy} onClick={() => void onConfirm(picks)} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50">按上面的选择合并</button>
                </footer>
            </section>
        </div>
    );
};

const Choice = ({label, text, at, active, onClick}: {label: string; text: string; at: string; active: boolean; onClick: () => void}) => (
    <button type="button" onClick={onClick} className={`rounded-xl border px-3 py-2 text-left ${active ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
        <span className="text-[11px] font-semibold text-slate-500">{label}{active ? ' · 将保留' : ''}</span>
        <span className="mt-1 block text-xs font-medium text-slate-800">{text || '（空）'}</span>
        {at && <span className="mt-1 block text-[11px] text-slate-400">{at}</span>}
    </button>
);
