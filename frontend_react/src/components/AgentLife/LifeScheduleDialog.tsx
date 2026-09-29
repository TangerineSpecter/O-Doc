import {useEffect, useState} from 'react';
import dayjs from 'dayjs';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {getLifeAgents, getLifeConfig} from '../../api/agentLife';
import type {AgentConfig} from '../../types/api/setting';
import type {LifeItem} from '../../types/api/agentLife';
import {useAgentLifeSchedule} from '../../hooks/useAgentLifeSchedule';
import LifeItemDetails from './LifeItemDetails';
import LifeProfilePanel from './LifeProfilePanel';
import {activityLabels, statusLabels} from './lifeLabels';

const dateKey = (value: string) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Shanghai'}).format(new Date(value));
export default function LifeScheduleDialog({onClose}: {onClose: () => void}) {
    const [start, setStart] = useState(() => {const today = dayjs(dateKey(new Date().toISOString())); return today.subtract((today.day() + 6) % 7, 'day').format('YYYY-MM-DD');});
    const [actorId, setActorId] = useState('');
    const [status, setStatus] = useState('');
    const [mode, setMode] = useState<'week' | 'list' | 'profile'>('week');
    const [agents, setAgents] = useState<AgentConfig[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [setupError, setSetupError] = useState('');
    const end = dayjs(start).add(7, 'day').format('YYYY-MM-DD');
    const schedule = useAgentLifeSchedule(start, end, actorId, status, page);
    useEffect(() => {const c = new AbortController(); Promise.all([getLifeAgents(c.signal), getLifeConfig(c.signal)]).then(([values, config]) => {if (!c.signal.aborted) setAgents(values.filter(a => (config.profileAgentIds || config.settings.agentIds).includes(a.id)));}).catch(e => {if (!c.signal.aborted) setSetupError(e.message || '居民加载失败');}); return () => c.abort();}, []);
    const names = new Map(agents.map(a => [a.id, a.name]));
    const days = Array.from({length: 7}, (_, index) => dayjs(start).add(index, 'day').format('YYYY-MM-DD'));
    const card = (item: LifeItem) => <button type="button" key={item.id} onClick={() => setSelected(item.id)} className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-orange-300 hover:bg-orange-50">
        <div className="flex flex-wrap items-center justify-between gap-1"><span className="text-sm font-semibold text-slate-800">{activityLabels[item.activity] || item.activity}</span><span className="text-[11px] text-slate-500">{statusLabels[item.status] || item.status}</span></div>
        <p className="mt-2 text-xs text-slate-500">{names.get(item.actorId) || '历史居民'} · {new Date(item.scheduledAt).toLocaleTimeString('zh-CN', {timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit'})}</p>
        {item.intent && <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-500">{item.intent}</p>}
        <p className="mt-2 text-xs text-orange-600">预算 {item.budget} · 已用 {item.spent}</p>
    </button>;
    return <WorldDialog title="居民生活日程" description="上海时间 · 计划根据实际经历持续调整" onClose={onClose} size="wide">
        <div className="space-y-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-full bg-slate-100 p-1">{([{id: 'week', label: '周日程'}, {id: 'list', label: '列表'}, {id: 'profile', label: '偏好与目标'}] as const).map(v => <button key={v.id} type="button" onClick={() => setMode(v.id)} className={`rounded-full px-4 py-2 text-sm ${mode === v.id ? 'bg-white font-semibold text-slate-800 shadow-sm' : 'text-slate-500'}`}>{v.label}</button>)}</div>
                <div className="min-w-40"><Select menuPortal value={actorId} options={[{value: '', label: '全部居民'}, ...agents.map(a => ({value: a.id, label: a.name}))]} onChange={v => {setActorId(v); setPage(1);}}/></div>
                {mode !== 'profile' && <div className="min-w-36"><Select menuPortal value={status} options={[{value: '', label: '全部状态'}, ...Object.entries(statusLabels).map(([value, label]) => ({value, label}))]} onChange={v => {setStatus(v); setPage(1);}}/></div>}
            </div>
            {setupError && <p role="alert" className="text-sm text-red-600">{setupError}</p>}
            {mode === 'profile' ? actorId ? <LifeProfilePanel key={actorId} actorId={actorId}/> : <p className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">选择一位居民，编辑生活偏好和目标。参与居民在统一生活设置中配置。</p> : <>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><div className="flex items-center gap-3"><button type="button" onClick={() => {setStart(dayjs(start).subtract(7, 'day').format('YYYY-MM-DD')); setPage(1);}} className="rounded-lg border border-slate-200 px-3 py-2">上一周</button><span>{start} — {dayjs(end).subtract(1, 'day').format('YYYY-MM-DD')}</span><button type="button" onClick={() => {setStart(end); setPage(1);}} className="rounded-lg border border-slate-200 px-3 py-2">下一周</button></div><button type="button" onClick={schedule.refresh} className="text-orange-600">刷新</button></div>
                {schedule.loading && <p className="text-sm text-slate-400">正在加载日程…</p>}
                {schedule.error && <p role="alert" className="text-sm text-red-600">{schedule.error}</p>}
                {!schedule.loading && !schedule.error && !schedule.data.items.length && <p className="rounded-2xl bg-slate-50 p-6 text-sm text-slate-500">这个时间范围暂无安排。开启统一生活后，会在具备足够时间时规划。</p>}
                {mode === 'week' ? <div className="overflow-x-auto"><div className="grid min-w-[980px] grid-cols-7 gap-3">{days.map(day => <section key={day} className="space-y-3 rounded-2xl bg-slate-50 p-3"><h4 className="text-sm font-semibold text-slate-700">{dayjs(day).format('MM-DD')} · {['日', '一', '二', '三', '四', '五', '六'][dayjs(day).day()]}</h4>{schedule.data.items.filter(i => dateKey(i.scheduledAt) === day).map(card)}</section>)}</div></div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{schedule.data.items.map(card)}</div>}
                {schedule.data.total > 100 && <div className="flex items-center justify-center gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage(v => v - 1)}>上一页</button><span>第 {page} 页 · 共 {schedule.data.total} 个安排</span><button type="button" disabled={page * 100 >= schedule.data.total} onClick={() => setPage(v => v + 1)}>下一页</button></div>}
            </>}
        </div>
        {selected && <LifeItemDetails id={selected} onClose={() => setSelected(null)} onChanged={schedule.refresh}/>}
    </WorldDialog>;
}
