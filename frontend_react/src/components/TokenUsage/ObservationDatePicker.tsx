import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import dayjs from 'dayjs';
import {CalendarDays, ChevronLeft, ChevronRight} from 'lucide-react';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

/** A single-date calendar for each edge of the observation range. */
export default function ObservationDatePicker({value, today, label, rangeStart, rangeEnd, onChange}: {
    value: string; today: string; label: string; rangeStart: string; rangeEnd: string;
    onChange: (value: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => dayjs(value).startOf('month'));
    const [position, setPosition] = useState<React.CSSProperties>({});
    const buttonRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();

    useLayoutEffect(() => {
        if (!open) return;
        const place = () => {
            const button = buttonRef.current?.getBoundingClientRect();
            const panel = panelRef.current?.getBoundingClientRect();
            if (!button || !panel) return;
            const margin = 12;
            const left = Math.max(margin, Math.min(button.left, window.innerWidth - panel.width - margin));
            const below = window.innerHeight - button.bottom - margin;
            const above = button.top - margin;
            const preferredTop = below < panel.height && above > below ? button.top - panel.height - 6 : button.bottom + 6;
            setPosition({position: 'fixed', left, top: Math.max(margin, Math.min(preferredTop, window.innerHeight - panel.height - margin)), zIndex: 160});
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);};
    }, [open, month]);

    useEffect(() => {
        if (!open) return;
        panelRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll: true});
        const dismiss = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
        };
        const keyboard = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setOpen(false);
                buttonRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', dismiss);
        document.addEventListener('keydown', keyboard);
        return () => {document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', keyboard);};
    }, [open]);

    const start = month.subtract((month.day() + 6) % 7, 'day');
    const cells = Array.from({length: 42}, (_, index) => start.add(index, 'day'));
    const choose = (day: string) => {onChange(day); setOpen(false); buttonRef.current?.focus();};

    return <>
        <button ref={buttonRef} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={panelId}
            onClick={() => {setMonth(dayjs(value).startOf('month')); setOpen(current => !current);}}
            className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 font-mono text-xs font-semibold text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50 ${open ? 'bg-white text-orange-600 shadow-2xs' : ''}`}>
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" aria-hidden="true"/>
            <span>{value.replace(/-/g, '/')}</span>
        </button>
        {open && createPortal(
            <div ref={panelRef} id={panelId} role="dialog" aria-label={`选择${label}`} style={position}
                className="scrollbar-hide w-[min(18rem,calc(100vw-24px))] max-h-[calc(100vh-24px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div>
                        <p className="text-[10px] font-medium text-slate-400">{label}</p>
                        <p className="mt-0.5 text-sm font-bold text-slate-800">{month.format('YYYY 年 M 月')}</p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button type="button" aria-label="上个月" onClick={() => setMonth(current => current.subtract(1, 'month'))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"><ChevronLeft className="h-4 w-4"/></button>
                        <button type="button" aria-label="下个月" onClick={() => setMonth(current => current.add(1, 'month'))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50"><ChevronRight className="h-4 w-4"/></button>
                    </div>
                </div>
                <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-semibold text-slate-400">
                    {weekdays.map(day => <span key={day} className="py-1">{day}</span>)}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                    {cells.map(day => {
                        const date = day.format('YYYY-MM-DD');
                        const selected = date === value;
                        const inRange = date >= rangeStart && date <= rangeEnd;
                        const isToday = date === today;
                        return <button key={date} type="button" aria-label={`${date} ${isToday ? '今天' : ''}`.trim()} aria-pressed={selected}
                            onClick={() => choose(date)}
                            className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 ${
                                selected ? 'bg-orange-500 font-bold text-white' : inRange ? 'bg-orange-50 font-medium text-orange-700 hover:bg-orange-100' :
                                day.month() === month.month() ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-300 hover:bg-slate-50'}`}>
                            {day.date()}
                            {isToday && !selected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-orange-400"/>}
                        </button>;
                    })}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                    <span className="text-[10px] text-slate-400">北京时间</span>
                    <button type="button" onClick={() => choose(today)} className="rounded-md px-2 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50">今天</button>
                </div>
            </div>, document.body)}
    </>;
}
