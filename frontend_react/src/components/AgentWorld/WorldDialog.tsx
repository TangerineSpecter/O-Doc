import type {ReactNode} from 'react';
import {useCallback, useContext, useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';
import './WorldDialog.css';
import {WorldDialogContext} from './WorldDialogContext';

export interface WorldDialogProps {
    title: string;
    description?: string;
    titleAction?: ReactNode;
    onClose: () => void;
    children: ReactNode;
    size?: 'compact' | 'default' | 'wide' | 'extra-wide' | 'full';
    fixedHeight?: boolean;
    manageFocus?: boolean;
}

function WorldDialogFrame({
    title,
    description,
    titleAction,
    onClose,
    children,
    size = 'default',
    fixedHeight,
    manageFocus = true,
}: WorldDialogProps) {
    const [isClosing, setIsClosing] = useState(false);
    const isClosingRef = useRef(false);
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const openerWasKeyboardFocusedRef = useRef(false);
    const dismissedByEscapeRef = useRef(false);
    const restoreFocusOnCloseRef = useRef(false);

    const isFixedHeight =
        fixedHeight ?? (size === 'wide' || size === 'extra-wide' || size === 'full');

    if (manageFocus && openerRef.current === null && typeof document !== 'undefined') {
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement !== document.body) {
            openerRef.current = activeElement;
            openerWasKeyboardFocusedRef.current = activeElement.matches(':focus-visible');
        }
    }

    const closeDialog = useCallback((dismissedByEscape = false) => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        dismissedByEscapeRef.current = dismissedByEscape;
        restoreFocusOnCloseRef.current = true;
        setIsClosing(true);

        closeTimerRef.current = setTimeout(() => {
            onClose();
        }, 160);
    }, [onClose]);

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                clearTimeout(closeTimerRef.current);
            }
        };
    }, []);

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

    useEscapeDismissal(true, () => {
        closeDialog(true);
        return true;
    });

    const sizeClass =
        size === 'full'
            ? 'max-w-[96vw] 2xl:max-w-[1680px]'
            : size === 'extra-wide'
              ? 'max-w-[95vw] 2xl:max-w-[1520px]'
              : size === 'wide'
                ? 'max-w-6xl'
                : size === 'compact'
                  ? 'max-w-2xl'
                  : 'max-w-3xl';

    // 嵌套弹窗不能受父卡片的动画 transform 和 overflow 裁切影响。
    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-5">
            <button
                type="button"
                aria-label="关闭"
                className={`absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity ${
                    isClosing ? 'world-dialog-overlay-exit' : 'world-dialog-overlay-enter'
                }`}
                onClick={() => closeDialog()}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`relative flex ${isFixedHeight ? 'h-[90vh] sm:h-[88vh]' : 'max-h-[90vh]'} w-full ${sizeClass} flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/20 ${
                    isClosing ? 'world-dialog-panel-exit' : 'world-dialog-panel-enter'
                }`}
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
                            {titleAction}
                        </div>
                        {description ? <p className="mt-0.5 text-[11px] text-slate-400">{description}</p> : null}
                    </div>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={() => closeDialog()}
                        aria-label="关闭面板"
                        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 active:scale-95"
                    >
                        <X className="h-4 w-4"/>
                    </button>
                </div>
                <div className="min-h-0 min-w-0 w-full flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide px-4 py-3 sm:px-5 sm:py-4 flex flex-col">{children}</div>
            </div>
        </div>,
        document.body
    );
}

function LoadedDialogContent({title, description, titleAction, size, fixedHeight, children}: WorldDialogProps) {
    const update = useContext(WorldDialogContext);
    useEffect(() => {update?.update({title, description, titleAction, size, fixedHeight});}, [update, title, description, titleAction, size, fixedHeight]);
    return <WorldDialogContext.Provider value={null}><div className="world-dialog-content-enter flex min-h-0 min-w-0 w-full flex-1 flex-col">{children}</div></WorldDialogContext.Provider>;
}

export default function WorldDialog(props: WorldDialogProps) {
    const inherited = useContext(WorldDialogContext);
    // 只复用当前入口的卡片；并列声明的设置、编辑等子弹窗仍独立入场。
    return inherited?.title === props.title ? <LoadedDialogContent {...props}/> : <WorldDialogFrame {...props}/>;
}
