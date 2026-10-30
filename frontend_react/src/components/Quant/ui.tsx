import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useEscapeDismissal } from '../../hooks/useEscapeDismissal';

export const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50';
export const cardClass =
    'rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-shadow duration-200 sm:p-6';

export function QuantBadge({
    children,
    tone = 'slate',
    className = '',
}: {
    children: ReactNode;
    tone?: 'orange' | 'emerald' | 'blue' | 'amber' | 'red' | 'purple' | 'slate';
    className?: string;
}) {
    const tones = {
        orange: 'border-orange-200/80 bg-orange-50 text-orange-700',
        emerald: 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
        blue: 'border-sky-200/80 bg-sky-50 text-sky-700',
        amber: 'border-amber-200/80 bg-amber-50 text-amber-700',
        red: 'border-red-200/80 bg-red-50 text-red-700',
        purple: 'border-violet-200/80 bg-violet-50 text-violet-700',
        slate: 'border-slate-200/80 bg-slate-100/80 text-slate-600',
    };
    return (
        <span
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
        >
            {children}
        </span>
    );
}

export function QuantButton({
    children,
    primary,
    danger,
    size = 'md',
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    primary?: boolean;
    danger?: boolean;
    size?: 'sm' | 'md';
}) {
    const sizeClass = size === 'sm' ? 'px-2.5 py-1.5 text-xs gap-1.5 rounded-lg' : 'px-3.5 py-2 text-xs sm:text-sm gap-2 rounded-xl';
    return (
        <button
            type="button"
            {...props}
            className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${sizeClass} ${
                primary
                    ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600 active:bg-orange-700'
                    : danger
                      ? 'border border-transparent text-red-600 hover:border-red-100 hover:bg-red-50'
                      : 'border border-slate-200 bg-white text-slate-700 shadow-2xs hover:border-orange-200 hover:bg-orange-50/40 hover:text-orange-700'
            } ${className}`}
        >
            {children}
        </button>
    );
}

export function QuantField({
    label,
    value,
    onChange,
    multiline = false,
    placeholder,
    rows = 4,
    type = 'text',
    required = false,
    hint,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    multiline?: boolean;
    placeholder?: string;
    rows?: number;
    type?: string;
    required?: boolean;
    hint?: string;
}) {
    return (
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
            <span className="flex items-center justify-between gap-2">
                <span>
                    {label}
                    {required && <span className="ml-1 text-red-500">*</span>}
                </span>
                {hint && <span className="text-xs font-normal text-slate-400">{hint}</span>}
            </span>
            {multiline ? (
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    placeholder={placeholder}
                    className={`${inputClass} resize-none font-normal leading-6 scrollbar-hide`}
                />
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`${inputClass} min-h-10 font-normal`}
                />
            )}
        </label>
    );
}

export function QuantModal({
    title,
    subtitle,
    close,
    children,
    wide = false,
    fixedHeight = false,
    busy = false,
    footer,
    layer = 'default',
}: {
    title: string;
    subtitle?: string;
    close: () => void;
    children: ReactNode;
    wide?: boolean;
    fixedHeight?: boolean;
    busy?: boolean;
    footer?: ReactNode;
    layer?: 'default' | 'confirmation';
}) {
    const dialog = useRef<HTMLElement>(null);
    const dismiss = () => {
        if (!busy) close();
    };
    useEscapeDismissal(true, dismiss);
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        dialog.current?.querySelector<HTMLElement>('input, textarea, button')?.focus();
        return () => previous?.focus();
    }, []);
    return (
        <div
            data-modal-scroll-lock
            className={`fixed inset-0 ${layer === 'confirmation' ? 'z-[130]' : 'z-[120]'} flex items-center justify-center bg-slate-900/40 p-3 sm:p-6 ${fixedHeight ? '' : 'backdrop-blur-sm animate-in fade-in duration-150'}`}
            onClick={dismiss}
        >
            <section
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${fixedHeight ? '' : 'animate-in zoom-in-95 slide-in-from-bottom-2 duration-200'} ${wide ? 'max-w-4xl' : 'max-w-2xl'} ${fixedHeight ? 'h-[90dvh]' : ''}`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key !== 'Tab') return;
                    const controls = Array.from(
                        dialog.current?.querySelectorAll<HTMLElement>(
                            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
                        ) || [],
                    ).filter((element) => element.offsetParent !== null);
                    const first = controls[0],
                        last = controls[controls.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last?.focus();
                    } else if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first?.focus();
                    }
                }}
            >
                <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-orange-50/40 via-white to-white px-6 py-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-bold text-slate-900">{title}</h2>
                        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        aria-label="关闭弹窗"
                        disabled={busy}
                        onClick={dismiss}
                        className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                    >
                        <X size={18} />
                    </button>
                </header>
                <div className={fixedHeight ? "min-h-0 flex-1 overflow-hidden p-4 sm:p-6" : "min-h-0 space-y-5 overflow-auto p-6 scrollbar-hide"}>{children}</div>
                {footer && (
                    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
                        {footer}
                    </footer>
                )}
            </section>
        </div>
    );
}

export function QuantEmpty({
    title,
    description,
    icon,
    children,
}: {
    title: string;
    description: string;
    icon?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <div className="relative flex min-h-60 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-200/90 bg-gradient-to-b from-white via-white to-orange-50/25 px-6 py-12 text-center shadow-2xs">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 text-orange-500 shadow-2xs">
                {icon || <Sparkles size={22} />}
            </div>
            <h3 className="text-base font-bold text-slate-800">{title}</h3>
            <p className="mb-5 mt-2 max-w-md text-xs leading-6 text-slate-500 sm:text-sm">{description}</p>
            {children}
        </div>
    );
}
