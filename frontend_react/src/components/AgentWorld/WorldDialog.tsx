import type {ReactNode} from 'react';
import {useEffect, useRef} from 'react';
import {X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import './WorldDialog.css';

interface WorldDialogProps {
    title: string;
    description?: string;
    onClose: () => void;
    children: ReactNode;
    size?: 'default' | 'wide';
    manageFocus?: boolean;
}

export default function WorldDialog({title, description, onClose, children, size = 'default', manageFocus = true}: WorldDialogProps) {
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const openerWasKeyboardFocusedRef = useRef(false);
    const dismissedByEscapeRef = useRef(false);
    const restoreFocusOnCloseRef = useRef(false);

    if (manageFocus && openerRef.current === null && typeof document !== 'undefined') {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement !== document.body) {
            openerRef.current = activeElement;
            openerWasKeyboardFocusedRef.current = activeElement.matches(':focus-visible');
        }
    }

    useEffect(() => {
        if (manageFocus && document.activeElement === openerRef.current) {
            closeButtonRef.current?.focus({preventScroll: true});
        }

        return () => {
            if (!manageFocus || !restoreFocusOnCloseRef.current) return;

            const opener = openerRef.current;
            if (!opener?.isConnected) return;

            if (dismissedByEscapeRef.current && !openerWasKeyboardFocusedRef.current) {
                const focusClass = 'world-dialog-return-focus-pointer';
                opener.classList.add(focusClass);
                const clearFocusClass = () => {
                    opener.classList.remove(focusClass);
                    opener.removeEventListener('blur', clearFocusClass);
                };
                opener.addEventListener('blur', clearFocusClass);
            }

            opener.focus({preventScroll: true});
        };
    }, [manageFocus]);

    const closeDialog = (dismissedByEscape = false) => {
        dismissedByEscapeRef.current = dismissedByEscape;
        restoreFocusOnCloseRef.current = true;
        onClose();
    };

    useEscapeDismissal(true, () => {
        closeDialog(true);
        return true;
    });

    return (
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-6">
            <button type="button" aria-label="关闭" className="absolute inset-0 bg-slate-950/40" onClick={() => closeDialog()}/>
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`relative flex max-h-[88vh] w-full ${size === 'wide' ? 'max-w-6xl' : 'max-w-3xl'} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl`}
            >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                    <div>
                        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                        {description ? <p className="mt-0.5 text-[11px] text-slate-400">{description}</p> : null}
                    </div>
                    <button ref={closeButtonRef} type="button" onClick={() => closeDialog()} aria-label="关闭面板" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
                        <X className="h-4 w-4"/>
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">{children}</div>
            </div>
        </div>
    );
}
