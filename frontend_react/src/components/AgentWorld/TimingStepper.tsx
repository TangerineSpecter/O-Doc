import {useState} from 'react';
import {Minus, Plus} from 'lucide-react';

interface TimingStepperProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    disabled?: boolean;
    onChange: (next: number) => void;
}

export default function TimingStepper({label, value, min, max, step = 1, disabled = false, onChange}: TimingStepperProps) {
    const [draft, setDraft] = useState({value, disabled, text: String(value)});
    // Reset a local edit when reloads or enable/disable changes replace its source.
    if (draft.value !== value || draft.disabled !== disabled) {
        setDraft({value, disabled, text: String(value)});
    }
    const clamp = (number: number) => Math.max(min, Math.min(max, Math.round(number)));
    const parsed = draft.text.trim() === '' ? NaN : Number(draft.text);
    const current = Number.isFinite(parsed) ? clamp(parsed) : value;
    const setText = (text: string) => setDraft({value, disabled, text});
    const commit = (next = current) => {
        const bounded = clamp(next);
        setText(String(bounded));
        if (bounded !== value) onChange(bounded);
    };

    return <div className={`flex items-stretch overflow-hidden rounded-xl border bg-white transition-all ${
        disabled ? 'border-slate-200/60 bg-slate-50/60 opacity-60'
            : 'border-slate-200 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20'
    }`}>
        <input type="number" min={min} max={max} value={draft.text} disabled={disabled} aria-label={label}
            onChange={event => setText(event.target.value)}
            onBlur={() => commit()}
            onKeyDown={event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setText(String(value));
                }
            }}
            className="w-full min-w-0 appearance-none bg-transparent px-3 py-2 text-sm font-semibold tabular-nums text-slate-800 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"/>
        <span className="flex select-none items-center px-1.5 text-xs text-slate-400">分钟</span>
        <div className="flex shrink-0 border-l border-slate-100">
            <button type="button" aria-label={`减少${label}`} disabled={disabled || current <= min}
                onClick={() => commit(current - step)}
                className="flex w-7 items-center justify-center text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-30">
                <Minus className="h-3.5 w-3.5"/>
            </button>
            <button type="button" aria-label={`增加${label}`} disabled={disabled || current >= max}
                onClick={() => commit(current + step)}
                className="flex w-7 items-center justify-center border-l border-slate-100 text-slate-400 transition-colors hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-30">
                <Plus className="h-3.5 w-3.5"/>
            </button>
        </div>
    </div>;
}
