import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronDown} from 'lucide-react';
import type {CSSProperties} from 'react';

export interface SelectOption<T extends string> {
    value: T;
    label: string;
    description?: string;
    icon?: React.ReactNode;
}

interface SelectProps<T extends string> {
    value: T;
    options: SelectOption<T>[];
    onChange: (value: T) => void;
    placeholder?: string;
    emptyMessage?: string;
    accentClassName?: string;
    buttonClassName?: string;
    menuClassName?: string;
    showSelectedDescription?: boolean;
    menuPlacement?: 'auto' | 'top' | 'bottom';
    menuPortal?: boolean;
}

export function Select<T extends string>({
    value,
    options,
    onChange,
    placeholder = '请选择',
    emptyMessage = '暂无可选项',
    accentClassName = 'text-orange-600 bg-orange-50',
    buttonClassName = '',
    menuClassName = '',
    showSelectedDescription = true,
    menuPlacement = 'auto',
    menuPortal = false,
}: SelectProps<T>) {
    const [open, setOpen] = useState(false);
    const [portalStyle, setPortalStyle] = useState<CSSProperties>({});
    const rootRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();
    const selected = options.find(option => option.value === value);

    useEffect(() => {
        if (!open) return;

        const closeOnOutside = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' || event.key === 'Esc') {
                event.stopPropagation();
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);

        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (!open || !menuPortal) return;

        const updatePosition = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;
            const expectedHeight = Math.min(288, options.length * 44 + 12);
            const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - 8);
            const spaceAbove = Math.max(0, rect.top - 8);
            const openAbove = menuPlacement === 'top'
                || (menuPlacement === 'auto' && spaceBelow < expectedHeight && spaceAbove > spaceBelow);
            const availableSpace = openAbove ? spaceAbove : spaceBelow;
            const maxHeight = Math.max(72, Math.min(288, availableSpace));
            const menuHeight = Math.min(expectedHeight, maxHeight);
            const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
            const top = openAbove
                ? Math.max(8, rect.top - menuHeight - 8)
                : Math.min(rect.bottom + 8, window.innerHeight - menuHeight - 8);
            setPortalStyle({top, left, width: Math.min(rect.width, window.innerWidth - 16), maxHeight});
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [menuPlacement, menuPortal, open, options.length]);

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                onClick={() => setOpen(prev => !prev)}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm transition-all hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${buttonClassName}`}
            >
                <span className="flex min-w-0 items-center gap-2">
                    {selected?.icon}
                    <span className="min-w-0 truncate">
                        <span className={`block truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
                            {selected?.label || placeholder}
                        </span>
                        {showSelectedDescription && selected?.description && (
                            <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                                {selected.description}
                            </span>
                        )}
                    </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
            </button>

            {open && (() => {
                const menu = (
                    <div
                    ref={menuRef}
                    id={listboxId}
                    role="listbox"
                    style={menuPortal ? portalStyle : undefined}
                    className={`${menuPortal ? 'fixed z-[200]' : `absolute z-30 min-w-full ${menuPlacement === 'top' ? 'bottom-full !mt-0 mb-2' : 'mt-2'}`} max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150 ${menuClassName}`}
                >
                    {options.length === 0 && (
                        <div className="flex min-h-20 items-center justify-center rounded-md px-3 py-4 text-center text-xs leading-5 text-slate-400">
                            {emptyMessage}
                        </div>
                    )}

                    {options.map(option => {
                        const active = option.value === value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                    onChange(option.value);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${active ? accentClassName : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    {option.icon}
                                    <span className="min-w-0 truncate">
                                        <span className="block truncate font-medium">{option.label}</span>
                                        {option.description && (
                                            <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-current opacity-70' : 'text-slate-400'}`}>
                                                {option.description}
                                            </span>
                                        )}
                                    </span>
                                </span>
                                {active && <Check className="h-4 w-4 shrink-0"/>}
                            </button>
                        );
                    })}
                    </div>
                );
                return menuPortal ? createPortal(menu, document.body) : menu;
            })()}
        </div>
    );
}
