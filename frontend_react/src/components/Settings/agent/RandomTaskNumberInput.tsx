import {Minus, Plus} from 'lucide-react';

interface Props {
    ariaLabel: string;
    value: string | number;
    onChange: (value: string) => void;
    min: number;
    max?: number;
    step?: number;
    className?: string;
}

export function RandomTaskNumberInput({ariaLabel, value, onChange, min, max, step = 1, className = ''}: Props) {
    const parsedValue = Number(value);
    const currentValue = Number.isFinite(parsedValue) ? parsedValue : min;
    const atMinimum = currentValue <= min;
    const atMaximum = max !== undefined && currentValue >= max;

    const adjust = (direction: -1 | 1) => {
        const baseValue = value === '' ? min - step : currentValue;
        const nextValue = baseValue + direction * step;
        onChange(String(Math.max(min, Math.min(max ?? Number.POSITIVE_INFINITY, nextValue))));
    };

    return <div className={`flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white transition focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20 ${className}`}>
        <input
            aria-label={ariaLabel}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={event => onChange(event.target.value)}
            className="min-w-0 flex-1 appearance-none bg-transparent px-3 text-sm text-slate-700 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <div className="flex shrink-0 border-l border-slate-100">
            <button
                type="button"
                aria-label={`减少${ariaLabel}`}
                disabled={atMinimum}
                onClick={() => adjust(-1)}
                className="flex w-8 items-center justify-center text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
                <Minus className="h-3.5 w-3.5"/>
            </button>
            <button
                type="button"
                aria-label={`增加${ariaLabel}`}
                disabled={atMaximum}
                onClick={() => adjust(1)}
                className="border-l border-slate-100 flex w-8 items-center justify-center text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
                <Plus className="h-3.5 w-3.5"/>
            </button>
        </div>
    </div>;
}
