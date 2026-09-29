import {CircleDollarSign} from 'lucide-react';
import type {DailyFeedEvent} from '../../types/api/dailyFeed';
import type {AgentWorldAgentStatus} from '../../types/api/setting';
import AgentAvatar from './AgentAvatar';

function formatAmount(value: string) {
    const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

function formatDate(value: string) {
    return new Date(value).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export default function DailyFinanceFeed({events, residents}: {
    events: DailyFeedEvent[];
    residents: AgentWorldAgentStatus[];
}) {
    return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs sm:shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <CircleDollarSign className="h-5 w-5"/>
            </span>
            <div>
                <h2 className="text-sm font-bold text-slate-800">收支流水</h2>
                <p className="mt-0.5 text-xs text-slate-500">按时间查看已记录的收入和支出</p>
            </div>
        </header>
        <div className="divide-y divide-slate-100">
            {events.map(event => {
                const amount = event.amount;
                const expense = amount?.startsWith('-') || false;
                const resident = residents.find(item => item.id === event.actorId);
                return <article key={event.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                    <div className="flex min-w-0 items-start gap-3">
                        <AgentAvatar name={resident?.name || event.actorName} avatar={resident?.avatar || ''} size="md"/>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">{resident?.name || event.actorName}</span>
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-700"><CircleDollarSign className="h-3 w-3"/>收支</span>
                            </div>
                            <p className="mt-1.5 text-sm font-semibold text-slate-800">{event.title}</p>
                            {event.detail && <p className="mt-1 truncate text-xs text-slate-600">{event.detail}</p>}
                            <time dateTime={event.occurredAt} className="mt-1 block text-[11px] text-slate-400">{formatDate(event.occurredAt)}</time>
                        </div>
                    </div>
                    {amount !== null && <span className={`shrink-0 whitespace-nowrap font-mono text-sm font-bold tabular-nums ${expense ? 'text-red-600' : 'text-emerald-700'}`}>
                        {expense ? '-¥' : '+¥'}{formatAmount(amount)}
                    </span>}
                </article>;
            })}
        </div>
    </section>;
}
