import {useId, type ReactNode} from 'react';
import {Check} from 'lucide-react';

export interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: ReactNode;
    description?: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
    className?: string;
    boxClassName?: string;
    labelClassName?: string;
    id?: string;
    name?: string;
    'aria-label'?: string;
}

export function Checkbox({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    size = 'md',
    className = '',
    boxClassName = '',
    labelClassName = '',
    id: customId,
    name,
    'aria-label': ariaLabel,
}: CheckboxProps) {
    const autoId = useId();
    const id = customId || autoId;

    const isSm = size === 'sm';
    const boxSize = isSm ? 'h-3.5 w-3.5' : 'h-4 w-4';
    const iconSize = isSm ? 'h-2.5 w-2.5' : 'h-3 w-3';
    const defaultLabelClass = isSm ? 'text-[11px] text-slate-600' : 'text-xs text-slate-700';

    return (
        <label
            htmlFor={id}
            className={`group inline-flex items-center gap-1.5 select-none transition-opacity ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            } ${className}`}
        >
            <span className="relative inline-flex items-center justify-center">
                <input
                    id={id}
                    name={name}
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    aria-label={ariaLabel}
                    onChange={e => onChange(e.target.checked)}
                    className="peer sr-only"
                />
                <span
                    aria-hidden="true"
                    className={`inline-flex items-center justify-center rounded transition-all duration-150 ${boxSize} ${
                        checked
                            ? 'border border-orange-500 bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                            : 'border border-slate-300 bg-white group-hover:border-orange-400'
                    } peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/30 peer-focus-visible:ring-offset-1 ${boxClassName}`}
                >
                    <Check
                        className={`${iconSize} stroke-[3] transition-transform duration-100 ${
                            checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                        }`}
                    />
                </span>
            </span>

            {(label || description) && (
                <span className="min-w-0 flex-1 leading-normal">
                    {label && <span className={`block font-medium ${defaultLabelClass} ${labelClassName}`}>{label}</span>}
                    {description && <span className="mt-0.5 block text-[10px] text-slate-400">{description}</span>}
                </span>
            )}
        </label>
    );
}

export default Checkbox;
