import {ChevronLeft, ChevronRight} from 'lucide-react';
import type {DiaryEntry} from '../../types/api/diary';
import {localDay} from './diaryDate';
interface Props {month: Date; onMonth: (month: Date) => void; selected: string; onSelect: (day: string) => void; entries: DiaryEntry[]}
export default function DiaryCalendar({month, onMonth, selected, onSelect, entries}: Props) {
    const year = month.getFullYear(), m = month.getMonth();
    const count = new Date(year, m + 1, 0).getDate();
    const offset = new Date(year, m, 1).getDay();
    const days = new Set(entries.map(entry => entry.entryDate));
    const today = localDay(new Date());
    const monthEntries = entries.filter(entry => entry.entryDate.startsWith(`${year}-${String(m + 1).padStart(2, '0')}`));
    return <aside className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between"><h2 className="font-bold text-slate-900">{year} 年 {m + 1} 月</h2><div className="flex gap-1"><button aria-label="上个月" onClick={() => onMonth(new Date(year, m - 1, 1))} className="rounded-lg p-1.5 hover:bg-slate-100"><ChevronLeft size={18}/></button><button aria-label="下个月" onClick={() => onMonth(new Date(year, m + 1, 1))} className="rounded-lg p-1.5 hover:bg-slate-100"><ChevronRight size={18}/></button></div></div>
        <div className="grid grid-cols-7 gap-y-3 text-center text-sm"><>{['日', '一', '二', '三', '四', '五', '六'].map(d => <span key={d} className="text-xs text-slate-400">{d}</span>)}</>
            {Array.from({length: offset}, (_, i) => <span key={`blank${i}`}/>)}
            {Array.from({length: count}, (_, i) => {
                const day = `${year}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
                return <button key={day} aria-label={day} aria-pressed={selected === day} onClick={() => onSelect(selected === day ? '' : day)} className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors ${selected === day ? 'bg-orange-500 text-white' : today === day ? 'bg-orange-50 font-bold text-orange-700' : 'text-slate-600 hover:bg-slate-100'}`}>{i + 1}{days.has(day) && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${selected === day ? 'bg-white' : 'bg-orange-500'}`}/>}</button>;
            })}
        </div>
        <button onClick={() => {onMonth(new Date()); onSelect(today);}} className="mt-5 text-xs font-medium text-orange-700 hover:text-orange-800">回到今天</button>
        <div className="mt-7 rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{selected ? `${selected} · 当日记录` : '本月记录'}</p><p className="mt-2 text-lg font-bold text-slate-900">{(selected ? entries.filter(e => e.entryDate === selected) : monthEntries).length} <span className="text-sm font-normal text-slate-500">篇日记</span></p><p className="mt-1 text-xs text-slate-500">平凡的一天，也值得被记住。</p></div>
    </aside>;
}
