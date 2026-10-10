import {useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {Select} from '../common/Select';
import {useCombat} from '../../hooks/useCombat';
import {useCombatActions} from '../../hooks/useCombatActions';
import {setCombatConfig} from '../../api/combat';
import CombatProfilePanel from './CombatProfilePanel';
import CombatObservation from './CombatObservation';
import {statusLabels} from './presentation';
export default function CombatDialog({residents, initialAgentId = '', explorationId = '', onClose}: {residents: {id: string; name: string}[]; initialAgentId?: string; explorationId?: string; onClose: () => void}) {
    const [actor, setActor] = useState(residents.some(r => r.id === initialAgentId) ? initialAgentId : residents[0]?.id || '');
    const state = useCombat(actor);
    const actions = useCombatActions(actor, state.reload);
    const [tab, setTab] = useState('profile');
    const [observation, setObservation] = useState(explorationId);
    const [configError, setConfigError] = useState('');
    const data = state.data;
    return <WorldDialog title="冒险与战斗" description="准备出发，探索迷宫，观察居民的成长。" size="wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col gap-3"><div className="flex shrink-0 flex-wrap items-center justify-between gap-3"><div className="w-40"><Select menuPortal value={actor} options={residents.map(r => ({value:r.id,label:r.name}))} onChange={id => {setActor(id); state.setPage(1);}}/></div><div className="flex gap-1 rounded-full bg-slate-100 p-1">{[['profile','冒险档案'],['history','探索历史']].map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-full px-3 py-2 text-xs ${tab === key ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>
            {data && <label className="flex shrink-0 items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={data.config.autoEnabled} onChange={event => {void setCombatConfig({autoEnabled:event.target.checked}).then(state.reload).catch(e => setConfigError(e instanceof Error ? e.message : '开关修改失败'));}}/>本机自动探索 · 每日最多 {data.config.dailyMinutes} 分钟</label>}
            {(state.error || actions.error || configError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{state.error || actions.error || configError}</p>}
            {actions.message && <p role="status" className="text-xs text-emerald-700">{actions.message}</p>}
            <div className="min-h-0 flex-1">{data ? tab === 'history' ? <div className="scrollbar-hide h-full overflow-y-auto space-y-3">{data.history?.list.map(run => <button key={run.id} onClick={() => setObservation(run.id)} className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left"><strong className="text-sm">{statusLabels[run.status] || run.status} · {Math.floor(run.elapsedSeconds/60)} 分钟</strong><p className="mt-1 text-xs text-slate-500">{run.result.report || new Date(run.createdAt).toLocaleString('zh-CN')}</p></button>)}<div className="flex justify-center gap-4 text-xs"><button disabled={state.page <= 1} onClick={() => state.setPage(p => p-1)}>上一页</button><span>第 {state.page} 页</span><button disabled={state.page*20 >= (data.history?.total || 0)} onClick={() => state.setPage(p => p+1)}>下一页</button></div></div> : data.profile ? <CombatProfilePanel profile={data.profile} catalog={data.catalog} actions={actions} onObserve={setObservation}/> : <p className="p-6 text-sm text-slate-500">请选择居民。</p> : <p className="p-6 text-sm text-slate-500">正在翻开冒险档案…</p>}</div>
        </div>
        {observation && <CombatObservation key={observation} id={observation} onClose={() => {setObservation(''); state.reload();}}/>}
    </WorldDialog>;
}
