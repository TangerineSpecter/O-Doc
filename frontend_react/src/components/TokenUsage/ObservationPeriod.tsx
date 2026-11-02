import {ArrowLeft, ArrowRight, Calendar} from 'lucide-react';
import {Select} from '../common/Select';
import {shiftDay} from '../../utils/tokenObservatory';

export interface ObservationRange {start: string; end: string}
export type ObservationPeriodMode = 'day' | '7' | '30' | 'custom';

export default function ObservationPeriod({range, mode, today, onChange}: {
    range: ObservationRange; mode: ObservationPeriodMode; today: string;
    onChange: (range: ObservationRange, mode: ObservationPeriodMode) => void;
}) {
    const move = (offset: number) => {
        const day = shiftDay(range.end, offset);
        onChange({start: day, end: day}, 'day');
    };
    const setMode = (next: ObservationPeriodMode) => {
        if (next === 'day') onChange({start: range.end, end: range.end}, next);
        else if (next === 'custom') onChange(range, next);
        else onChange({start: shiftDay(today, next === '7' ? -6 : -29), end: today}, next);
    };
    const changeDate = (edge: 'start' | 'end', value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
        if (mode === 'day') onChange({start: value, end: value}, 'day');
        else if (edge === 'start') onChange({start: value, end: value > range.end ? value : range.end}, 'custom');
        else onChange({start: value < range.start ? value : range.start, end: value}, 'custom');
    };
    const inputClass = 'w-24 sm:w-28 bg-transparent font-mono text-xs font-semibold text-slate-700 outline-none focus:ring-0 cursor-pointer';

    return (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="观测周期">
            <div className="w-28">
                <Select ariaLabel="观测周期" value={mode} onChange={setMode} menuPortal menuClassName="scrollbar-hide"
                    buttonClassName="!min-h-8 !py-1 !px-2 !text-xs !shadow-none"
                    options={[
                        {value: 'day', label: '单日'}, {value: '7', label: '近 7 天'},
                        {value: '30', label: '近 30 天'}, {value: 'custom', label: '自定义'},
                    ]}/>
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50 p-1">
                {mode === 'day' && <button type="button" aria-label="前一天" title="前一天" onClick={() => move(-1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white"><ArrowLeft className="h-3.5 w-3.5"/></button>}
                <Calendar className="ml-1 hidden h-3.5 w-3.5 text-slate-400 sm:block"/>
                <input type="date" aria-label={mode === 'day' ? '观测日期' : '开始日期'} value={range.start}
                    onChange={event => changeDate('start', event.target.value)} className={inputClass}/>
                {mode !== 'day' && <>
                    <span className="text-xs text-slate-400">至</span>
                    <input type="date" aria-label="结束日期" value={range.end}
                        onChange={event => changeDate('end', event.target.value)} className={inputClass}/>
                </>}
                {mode === 'day' && <button type="button" aria-label="后一天" title="后一天" onClick={() => move(1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 hover:bg-white"><ArrowRight className="h-3.5 w-3.5"/></button>}
                {(mode !== 'day' || range.end !== today) && <button type="button" onClick={() => onChange({start: today, end: today}, 'day')}
                    className="rounded-md bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-600 hover:bg-orange-100">今天</button>}
            </div>
        </div>
    );
}
