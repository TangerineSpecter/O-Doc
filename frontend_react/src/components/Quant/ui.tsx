import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useEscapeDismissal } from '../../hooks/useEscapeDismissal';

export const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50';
export const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';

export function QuantButton({
    children,
    primary,
    danger,
    className = '',
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean }) {
    return (
        <button
            type="button"
            {...props}
            className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${primary ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20 hover:bg-orange-600' : danger ? 'text-red-600 hover:bg-red-50' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'} ${className}`}
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
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    multiline?: boolean;
    placeholder?: string;
    rows?: number;
    type?: string;
    required?: boolean;
}) {
    return (
        <label className="block space-y-2 text-sm font-semibold text-slate-700">
            <span>
                {label}
                {required && <span className="ml-1 text-red-500">*</span>}
            </span>
            {multiline ? (
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    placeholder={placeholder}
                    className={`${inputClass} resize-none font-normal scrollbar-hide`}
                />
            ) : (
                <input
                    type={type}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={`${inputClass} font-normal`}
                />
            )}
        </label>
    );
}

export function QuantModal({
    title,
    close,
    children,
    wide = false,
    busy = false,
}: {
    title: string;
    close: () => void;
    children: ReactNode;
    wide?: boolean;
    busy?: boolean;
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
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 p-3 backdrop-blur-sm sm:p-6"
            onClick={dismiss}
        >
            <section
                ref={dialog}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className={`flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}
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
                <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h2 className="text-lg font-bold text-slate-900">{title}</h2>
                    <button
                        type="button"
                        aria-label="关闭弹窗"
                        disabled={busy}
                        onClick={dismiss}
                        className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
                    >
                        <X size={18} />
                    </button>
                </header>
                <div className="min-h-0 space-y-5 overflow-auto p-5 scrollbar-hide">{children}</div>
            </section>
        </div>
    );
}

export function QuantEmpty({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
            <div className="mb-4 h-2 w-8 rounded-full bg-orange-200" />
            <h3 className="font-semibold text-slate-800">{title}</h3>
            <p className="mb-5 mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
            {children}
        </div>
    );
}
