import {useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, CalendarClock, Loader2, RefreshCw} from 'lucide-react';
import WorldDialog from '../AgentWorld/WorldDialog';
import AgentAvatar from '../AgentWorld/AgentAvatar';
import {useTokenObservatory} from '../../hooks/useTokenObservatory';
import {clockTime, dayOf, observedActivities, requestOrder, shiftDay} from '../../utils/tokenObservatory';
import {requestStatus, shanghaiDay, tokenNumber} from '../../utils/tokenUsage';
import ObservationOverview from './ObservationOverview';
import ObservationTimeline from './ObservationTimeline';
import ObservationInspector from './ObservationInspector';

export interface ObservatoryProps {
    recordId?: string | null; agentId?: string; agentName?: string; avatar?: string;
    taskName?: string; startedAt?: string; initialDate?: string; onClose: () => void;
}
export default function ExecutionObservatoryDialog({recordId, agentId = '', agentName, avatar, taskName, startedAt, initialDate, onClose}: ObservatoryProps) {
    const [date, setDate] = useState(() => initialDate || (startedAt ? dayOf(startedAt) : shanghaiDay()));
    const [actor, setActor] = useState(agentId);
    const [daily, setDaily] = useState(!recordId);
    const [refresh, setRefresh] = useState(0);
    const [activityId, setActivityId] = useState('');
    const [requestId, setRequestId] = useState('');
    const {requests, facts, errors, loading} = useTokenObservatory(actor, date, daily ? undefined : recordId || undefined, refresh);
    const ordered = useMemo(() => [...requests].sort(requestOrder), [requests]);
    const activities = useMemo(() => observedActivities(requests, facts), [requests, facts]);
    const activity = activities.find(a => a.id === activityId) || activities[0];
    const current = activity?.requests.find(r => r.id === requestId) || activity?.requests[0];
    const previous = current && activity ? activity.requests[activity.requests.indexOf(current) - 1] : undefined;
    const name = daily ? requests.find(r => r.agentKey === actor)?.agentName || agentName || (actor ? '居民' : '系统规划') : taskName || '任务执行';
    const button = 'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50';
    return <WorldDialog title="执行观测" description={daily ? '北京时间 · 当天全部已采集调用与业务事实' : '本次执行 · 包含跨日请求'} size="extra-wide" onClose={onClose}>
        <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl bg-slate-50 p-3 sm:p-4">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><AgentAvatar name={name} avatar={avatar}/><div className="min-w-0"><h2 className="text-lg font-semibold text-slate-800">{name}{daily ? '的一天' : ''}</h2><p className="text-[11px] text-slate-400">活动、模型与输入，在一条线上看清楚</p></div></div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {daily ? <><button type="button" className={button} aria-label="前一天" onClick={() => setDate(day => shiftDay(day, -1))}><ArrowLeft className="h-3.5 w-3.5"/></button><input type="date" aria-label="观测日期" value={date} onChange={e => {if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setDate(e.target.value);}} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600"/><button type="button" className={button} aria-label="后一天" onClick={() => setDate(day => shiftDay(day, 1))}><ArrowRight className="h-3.5 w-3.5"/></button></> : current?.agentKey ? <button type="button" className={button} onClick={() => {setActor(current.agentKey); setDate(dayOf(current.startedAt)); setDaily(true);}}>查看该居民当天</button> : null}
                    {recordId && daily && <button type="button" className={button} onClick={() => setDaily(false)}>返回本次执行</button>}
                    <button type="button" className={button} aria-label="刷新执行观测" onClick={() => setRefresh(v => v + 1)}><RefreshCw className="h-3.5 w-3.5"/></button>
                </div>
            </div>
            {errors.length > 0 && <div role="alert" className="shrink-0 rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">{errors.join('；')}。<button type="button" onClick={() => setRefresh(v => v + 1)} className="ml-2 whitespace-nowrap underline">重试</button></div>}
            {loading ? <div role="status" className="flex flex-1 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-orange-500"/>正在读取观测数据…</div> : <>
                <ObservationOverview requests={ordered} selected={current?.id} unavailable={errors.some(e => e.startsWith('模型请求'))} onSelect={row => {const match = activities.find(a => a.requests.some(r => r.id === row.id)); if (match) setActivityId(match.id); setRequestId(row.id);}}/>
                {!activity ? <div className="flex flex-1 items-center justify-center gap-2 text-xs text-slate-400"><CalendarClock className="h-5 w-5"/>{errors.length ? '数据读取不完整，请重试' : '此范围没有已采集请求或业务活动'}</div> : <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden lg:grid-cols-[210px_minmax(0,1fr)] lg:grid-rows-1">
                    <ObservationTimeline activities={activities} selected={activity.id} onSelect={id => {setActivityId(id); setRequestId('');}}/>
                    <main className="scrollbar-hide min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="活动执行详情">
                        <header className="border-b border-slate-100 p-4 sm:p-5"><h3 className="text-sm font-semibold text-slate-800">{activity.title}</h3><p className="mt-1 text-[11px] text-slate-400">{activity.requests.length} 次模型请求 · {activity.facts.length} 项明确关联的业务事实</p></header>
                        {activity.requests.length > 0 && <section className="space-y-2 p-4 sm:p-5"><p className="text-[11px] text-slate-400">按请求开始时间排序；时间顺序不代表依赖关系</p>{activity.requests.map((row, i) => <button type="button" key={row.id} aria-pressed={current?.id === row.id} onClick={() => setRequestId(row.id)} className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-left ${current?.id === row.id ? 'border-orange-200 bg-orange-50/40' : 'border-slate-200 hover:bg-slate-50'}`}><span className="flex min-w-0 flex-wrap items-center gap-2"><span className="rounded-md bg-slate-100 px-1.5 py-1 font-mono text-[10px] text-slate-500">{i + 1}</span><span className="text-xs font-medium text-slate-700">{row.phase || row.purpose}</span><span className={`rounded px-1.5 py-0.5 text-[10px] ${row.modelType === 'decision_model' ? 'bg-violet-50 text-violet-600' : 'bg-orange-50 text-orange-600'}`}>{row.modelName || '未知模型'}</span><span className="text-[10px] text-slate-400">{clockTime(row.startedAt)} · {requestStatus[row.status] || row.status}{row.attempt > 1 ? ` · 重试 ${row.attempt}` : ''}</span></span><span className="font-mono text-[11px] text-slate-500">{tokenNumber(row.inputTokens)} 输入 / {tokenNumber(row.outputTokens)} 输出</span></button>)}</section>}
                        {activity.facts.length > 0 && <section className="border-t border-slate-100 px-4 py-3"><details open={!activity.requests.length}><summary className="text-xs font-medium text-emerald-700">业务结果 · {activity.facts.length} 项已记录事实（展开查看）</summary><div className="mt-2 space-y-2">{activity.facts.map(fact => <div key={fact.id} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-medium text-slate-700">{fact.title} <span className="text-[10px] font-normal text-slate-400">{clockTime(fact.occurredAt)} · {requestStatus[fact.status] || fact.status}</span></p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-500">{fact.detail}</p>{fact.steps?.map(step => <details key={step.id} className="mt-2 text-xs text-slate-500"><summary>{step.title}</summary><p className="mt-1 whitespace-pre-wrap break-words">{step.detail}</p></details>)}</div>)}{!activity.requests.length && <p className="text-[11px] text-slate-400">没有可明确关联的模型请求；不据此推定本活动消耗为零。</p>}</div></details></section>}
                        {current && <ObservationInspector key={current.id} current={current} previous={previous} refresh={refresh}/>}
                    </main>
                </div>}
            </>}
        </div>
    </WorldDialog>;
}
