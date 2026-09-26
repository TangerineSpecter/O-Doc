import type {ReactNode} from 'react';
import {X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface WorldDialogProps {
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
}

export default function WorldDialog({title, description, onClose, children}: WorldDialogProps) {
    useEscapeDismissal(true, () => {
        onClose();
        return true;
    });

    return (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-6">
            <button type="button" aria-label="关闭" className="absolute inset-0 bg-slate-950/40" onClick={onClose}/>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                        {description ? <p className="mt-0.5 text-[11px] text-slate-400">{description}</p> : null}
                    </div>
                    <button type="button" onClick={onClose} aria-label="关闭面板" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                        <X className="h-4 w-4"/>
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">{children}</div>
            </div>
        </div>
    );
}
