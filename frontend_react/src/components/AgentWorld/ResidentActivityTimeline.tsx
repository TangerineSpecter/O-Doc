import {Activity, BookOpenText, CalendarDays, CircleDollarSign, MapPin, MessageSquare, Package, Sprout, Store, TrendingUp} from 'lucide-react';
import type {DailyFeedEvent} from '../../types/api/dailyFeed';
import {groupResidentActivities, residentActivitySummary} from '../../utils/residentActivity';
import {socialTime} from '../../utils/socialTime';

const categories = {
    publication: {label: '创作', icon: BookOpenText, color: 'text-amber-600 bg-amber-50 border-amber-200'},
    interaction: {label: '互动', icon: MessageSquare, color: 'text-orange-600 bg-orange-50 border-orange-200'},
    travel: {label: '旅行', icon: MapPin, color: 'text-sky-600 bg-sky-50 border-sky-200'},
    cooking: {label: '烹饪', icon: Activity, color: 'text-orange-600 bg-orange-50'},
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
            const meta = categories[event.category];
            const Icon = meta.icon;
            const latest = event.id === events[0]?.id;
            return <li key={event.id} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-3 last:pb-0">
                {index < group.events.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-7 w-px bg-slate-200/80"/>}
                <span aria-hidden="true" className={`relative z-10 mt-3 flex h-7 w-7 items-center justify-center rounded-md border ${event.status === 'failed' ? 'border-red-200 bg-red-50 text-red-500' : meta.color}`}><Icon className="h-3.5 w-3.5"/></span>
                <div className={`rounded-lg border p-3 transition-colors ${latest ? 'border-orange-200/80 bg-orange-50/40' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/50'}`}>
                    <div className="mb-1.5 flex items-center gap-2 text-[10px]"><span className="font-medium text-slate-500">{meta.label}</span><span className="text-slate-200">/</span><time dateTime={event.occurredAt} title={socialTime(event.occurredAt)} className="tabular-nums text-slate-400">{socialTime(event.occurredAt).split(' ')[1]}</time>{latest && <span className="ml-auto flex items-center gap-1 text-orange-600"><span className="h-1 w-1 rounded-full bg-orange-500"/>最新</span>}{event.status === 'failed' && <span className="text-red-500">未完成</span>}</div>
                    <p className="break-words text-sm font-medium leading-6 text-slate-700">{residentActivitySummary(event, name)}</p>
                </div>
            </li>;
        })}</ol>
    </section>)}</div>;
}
