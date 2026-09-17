import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

interface Selection {title: string; summary: string; chapters?: number[]}
interface Props {selection: Selection; onClose: () => void}

export default function BiographyMindmapFocus({selection, onClose}: Props) {
    const dialog = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialog.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Tab' && dialog.current) {
                const closeButton = dialog.current.querySelector<HTMLButtonElement>('button');
                if (!closeButton) return;
                if (event.shiftKey && (document.activeElement === dialog.current || document.activeElement === closeButton)) {
                    event.preventDefault();
                    closeButton.focus();
                } else if (!event.shiftKey && document.activeElement === closeButton) {
                    event.preventDefault();
                    closeButton.focus();
                } else if (!dialog.current.contains(document.activeElement)) {
                    event.preventDefault();
                    dialog.current.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            previouslyFocused?.focus();
        };
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8" role="presentation">
            <button type="button" tabIndex={-1} aria-hidden="true" onClick={onClose} className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[2px]"/>
            <div ref={dialog} role="dialog" aria-modal="true" aria-label={selection.title} tabIndex={-1} className="relative z-10 w-full max-w-[520px] max-h-[min(80vh,640px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none">
                <div className="h-1 bg-orange-400" aria-hidden="true"/>
                <div className="px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <p className="text-[11px] font-semibold tracking-[.14em] text-orange-700">{selection.chapters ? '细分线索' : '主题脉络'}</p>
                            <h3 className="mt-2 font-serif text-xl font-semibold leading-8 text-slate-900 sm:text-[22px]">{selection.title}</h3>
                        </div>
                        <button type="button" onClick={onClose} aria-label="关闭节点说明" className="shrink-0 rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"><X className="h-4 w-4"/></button>
                    </div>
                </div>
                <div className="border-y border-slate-100 bg-slate-50/60 px-5 py-5 sm:px-7">
                    <p className="mb-2 text-[11px] font-semibold text-slate-500">核心归纳</p>
                    <p className="text-sm leading-7 text-slate-700">{selection.summary}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 sm:px-7">
                    <p className="text-[11px] text-slate-400">AI 归纳 · 非原文引述</p>
                    {!!selection.chapters?.length && <div className="flex flex-wrap gap-1.5" aria-label="所涉章节">{selection.chapters.map(n => <span key={n} className="rounded-md border border-orange-100 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-800">第 {n} 章</span>)}</div>}
                </div>
            </div>
        </div>,
        document.body,
    );
}
