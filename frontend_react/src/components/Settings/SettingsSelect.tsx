import {useEffect, useId, useRef, useState} from 'react';
import {Check, ChevronDown} from 'lucide-react';

export interface SettingsSelectOption<T extends string> {
    value: T;
    label: string;
    description?: string;
}

interface SettingsSelectProps<T extends string> {
    value: T;
    options: SettingsSelectOption<T>[];
    onChange: (value: T) => void;
    placeholder?: string;
    emptyMessage?: string;
    accentClassName?: string;
    buttonClassName?: string;
}

export function SettingsSelect<T extends string>({
    value,
    options,
    onChange,
    placeholder = '请选择',
    emptyMessage = '暂无可选项',
    accentClassName = 'text-orange-600 bg-orange-50',
    buttonClassName = '',
}: SettingsSelectProps<T>) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const listboxId = useId();
    const selected = options.find(option => option.value === value);

    useEffect(() => {
        if (!open) return;

        const closeOnOutside = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', closeOnOutside);
        document.addEventListener('keydown', closeOnEscape);

        return () => {
            document.removeEventListener('mousedown', closeOnOutside);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [open]);

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
                <span className="min-w-0">
                    <span className={`block truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
                        {selected?.label || placeholder}
                    </span>
                    {selected?.description && (
                        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                            {selected.description}
                        </span>
                    )}
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}/>
            </button>

            {open && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute z-30 mt-2 max-h-72 min-w-full overflow-auto rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150"
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
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{option.label}</span>
                                    {option.description && (
                                        <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-current opacity-70' : 'text-slate-400'}`}>
                                            {option.description}
                                        </span>
                                    )}
                                </span>
                                {active && <Check className="h-4 w-4 shrink-0"/>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
