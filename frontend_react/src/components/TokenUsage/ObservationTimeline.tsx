import type {ObservedActivity} from '../../utils/tokenObservatory';
import {clockTime, knownTokens} from '../../utils/tokenObservatory';
import {tokenNumber} from '../../utils/tokenUsage';

export default function ObservationTimeline({activities, selected, onSelect}: {
    activities: ObservedActivity[]; selected?: string; onSelect: (id: string) => void;
}) {
    return <aside className="scrollbar-hide min-h-0 max-h-52 overflow-y-auto lg:max-h-none" aria-label="当天时间轴">
        <div className="mb-4 flex items-center justify-between px-1"><h3 className="text-xs font-semibold text-slate-700">时间轴</h3><span className="text-[11px] text-slate-400">{activities.length} 件事</span></div>
        <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[5px] before:top-5 before:w-px before:bg-slate-200">
            {activities.map(item => <li key={item.id} className="relative pl-5"><span aria-hidden="true" className={`absolute left-0 top-4 h-[11px] w-[11px] rounded-full border-2 border-slate-50 ${selected === item.id ? 'bg-orange-500 ring-4 ring-orange-100' : 'bg-emerald-400 ring-1 ring-emerald-200'}`}/><button type="button" aria-pressed={selected === item.id} onClick={() => onSelect(item.id)} className={`w-full rounded-xl border p-2.5 text-left transition-colors ${selected === item.id ? 'border-slate-200 bg-white shadow-sm' : 'border-transparent hover:bg-slate-100'}`}>
                <time dateTime={item.startedAt} className={`font-mono text-[11px] ${selected === item.id ? 'text-orange-600' : 'text-slate-400'}`}>{clockTime(item.startedAt)}</time>
                <p className="my-1.5 break-words text-xs font-medium text-slate-800">{item.title}</p>
                {item.requests.length ? <div className="flex flex-wrap justify-between gap-1 text-[10px] text-slate-500"><span>{item.requests.length} 次模型请求</span><span className="font-mono">{tokenNumber(knownTokens(item.requests, 'totalTokens'))} token</span></div> : <p className="text-[10px] text-slate-400">业务事实 · 无关联模型请求</p>}
                {item.requests[0]?.agentName && <p className="mt-1 truncate text-[10px] text-slate-400">{item.requests[0].agentName}</p>}
            </button></li>)}
        </ol>
    </aside>;
}
