import {Activity, BookOpenText, CalendarDays, CircleDollarSign, MapPin, MessageSquare, Package, Sprout, Store, TrendingUp} from 'lucide-react';
import type {DailyFeedEvent} from '../../types/api/dailyFeed';
import {groupResidentActivities, residentActivitySummary} from '../../utils/residentActivity';
import {socialTime} from '../../utils/socialTime';

const categories = {
    publication: {label: '创作', icon: BookOpenText, color: 'text-amber-600 bg-amber-50 border-amber-200'},
    interaction: {label: '互动', icon: MessageSquare, color: 'text-orange-600 bg-orange-50 border-orange-200'},
    travel: {label: '旅行', icon: MapPin, color: 'text-sky-600 bg-sky-50 border-sky-200'},
    exploration: {label:'探索',icon:Activity,color:'text-orange-700'},
    cooking: {label: '烹饪', icon: Activity, color: 'text-orange-600 bg-orange-50 border-orange-200'},
    farm: {label: '农场', icon: Sprout, color: 'text-lime-600 bg-lime-50 border-lime-200'},
    market: {label: '市场', icon: Store, color: 'text-slate-500 bg-slate-50 border-slate-200'},
    trade: {label: '交易', icon: Package, color: 'text-slate-500 bg-slate-50 border-slate-200'},
    investment: {label: '投资', icon: TrendingUp, color: 'text-slate-500 bg-slate-50 border-slate-200'},
    finance: {label: '收支', icon: CircleDollarSign, color: 'text-slate-500 bg-slate-50 border-slate-200'},
    record: {label: '记录', icon: Activity, color: 'text-slate-500 bg-slate-50 border-slate-200'},
};

export default function ResidentActivityTimeline({events, name}: {events: DailyFeedEvent[]; name: string}) {
    return <div className="space-y-5">{groupResidentActivities(events).map(group => <section key={group.date} aria-label={group.date}>
        <header className="mb-3 flex items-center gap-2 text-[11px]"><CalendarDays className="h-3.5 w-3.5 text-slate-400"/><h3 className="font-semibold text-slate-600">{group.date}</h3><span className="h-px min-w-4 flex-1 bg-slate-100"/><span className="tabular-nums text-slate-400">{group.events.length} 条</span></header>
        <ol>{group.events.map((event, index) => {
            const meta = categories[event.category] || categories.record;
            const Icon = meta.icon;
            const latest = event.id === events[0]?.id;
            const timeStr = socialTime(event.occurredAt).split(' ')[1] || '';
            const summary = residentActivitySummary(event, name);
            return <li key={event.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] items-center gap-3 pb-2.5 last:pb-0">
                {index < group.events.length - 1 && <span aria-hidden="true" className="absolute bottom-[-10px] left-[13.5px] top-1/2 w-px bg-slate-200/80 -z-0"/>}
                <span aria-hidden="true" className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${event.status === 'failed' ? 'border-red-200 bg-red-50 text-red-500' : meta.color}`}><Icon className="h-3.5 w-3.5"/></span>
                <div className={`flex min-h-[42px] items-center gap-2 rounded-lg border px-3 py-2 transition-colors sm:gap-2.5 ${latest ? 'border-orange-200/80 bg-orange-50/40' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50'}`}>
                    <time dateTime={event.occurredAt} title={socialTime(event.occurredAt)} className="shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-400">【{timeStr}】</time>
                    <span className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${meta.color}`}>{meta.label}</span>
                    <p className="min-w-0 flex-1 break-words text-xs font-medium text-slate-700 sm:text-sm" title={summary}>{summary}</p>
                    {latest && <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] font-medium text-orange-600"><span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse"/>最新</span>}
                    {event.status === 'failed' && <span className="ml-auto shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-600 border border-red-200">未完成</span>}
                </div>
            </li>;
        })}</ol>
    </section>)}</div>;
}
