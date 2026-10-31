import {useState, type ComponentType, type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export function QuantCollapsible({
    title,
    subtitle,
    badge,
    icon: Icon,
    children,
    defaultOpen = false,
    open: controlledOpen,
    onToggle,
    className = '',
    contentClassName = '',
}: {
    title: ReactNode;
    subtitle?: ReactNode;
    badge?: ReactNode;
    icon?: ComponentType<{size?: number; className?: string}>;
    children: ReactNode;
    defaultOpen?: boolean;
    open?: boolean;
    onToggle?: (open: boolean) => void;
    className?: string;
    contentClassName?: string;
}) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

    const handleToggle = () => {
        const next = !isOpen;
        if (controlledOpen === undefined) {
            setInternalOpen(next);
        }
        onToggle?.(next);
    };

    return (
        <div className={`overflow-hidden rounded-xl border border-slate-200/90 bg-white transition-shadow duration-200 hover:border-slate-300 ${className}`}>
            <button
                type="button"
                onClick={handleToggle}
                className="flex w-full items-center justify-between gap-3 bg-slate-50/60 px-4 py-3 text-left transition-colors hover:bg-slate-50 active:bg-slate-100/60"
            >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    {Icon && <Icon size={16} className="shrink-0 text-slate-500" />}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-slate-800 sm:text-sm">{title}</span>
                            {badge}
                        </div>
                        {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
                    </div>
                </div>
                <div className="shrink-0 p-0.5 text-slate-400">
                    <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>
            {isOpen && (
                <div className={`border-t border-slate-100 p-4 ${contentClassName}`}>
                    {children}
                </div>
            )}
        </div>
    );
}
