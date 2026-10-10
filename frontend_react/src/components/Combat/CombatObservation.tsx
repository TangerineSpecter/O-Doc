import {useEffect, useRef, useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {useCombatObservation} from '../../hooks/useCombatObservation';
import {explorationCommand} from '../../api/combat';
import EquipmentCard from './EquipmentCard';
import type {EquipmentSnapshot, CombatReward, Combatant} from '../../types/api/combat';
import {actionText, elapsed, statusLabels} from './presentation';

function Fighter({entity, label}: {entity: Combatant | null; label: string}) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs text-slate-500">{label}</p><h3 className="mt-1 font-semibold">{entity ? `${entity.name} · Lv.${entity.level}` : '等待遭遇'}</h3>
        {entity && <><p className="mt-3 text-xs">HP {entity.hp} / {entity.stats.hpMax}</p><progress aria-label={`${label}生命`} value={entity.hp} max={Number(entity.stats.hpMax)} className="mt-1 h-2 w-full accent-orange-500"/><p className="mt-2 text-xs text-slate-500">MP {entity.mp} / {entity.stats.mpMax}</p><p className="mt-2 text-xs text-slate-500">{entity.states.map(s => s.name).join('、') || '无持续状态'}</p></>}
    </section>;
}
export default function CombatObservation({id, onClose}: {id: string; onClose: () => void}) {
    const state = useCombatObservation(id);
    const [tab, setTab] = useState<'events' | 'drops' | 'kills'>('events');
    const [commandError, setCommandError] = useState('');
    const [gear,setGear] = useState<CombatReward | null>(null);
    const [busy, setBusy] = useState(false);
    const list = useRef<HTMLDivElement>(null);
    const following = useRef(true);
    const snapshot = state.snapshot;
    useEffect(() => {if (tab === 'events' && following.current && list.current) list.current.scrollTop = list.current.scrollHeight;}, [state.events.length, tab]);
    const command = async (operation: 'recall' | 'resume') => {
        setBusy(true); setCommandError('');
        try {await explorationCommand(id, operation);} catch (e) {setCommandError(e instanceof Error ? e.message : '操作失败');} finally {setBusy(false);}
    };
    return <WorldDialog title="探索观察" description="关闭窗口后探索继续；所有数值以已确认战斗记录为准。" size="wide" onClose={onClose}>
        <div className="flex h-full min-h-0 flex-col gap-3">
            {(state.error || commandError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{state.error ? `连接中断，保留最后确认状态：${state.error}` : commandError}</p>}
            {snapshot ? <>
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl bg-orange-50 p-4">
                    <div><strong>{statusLabels[snapshot.status] || snapshot.status} · {statusLabels[snapshot.stage] || snapshot.stage}</strong><p className="mt-1 text-xs text-slate-600">有效时长 {elapsed(snapshot.elapsedSeconds)} / {elapsed(snapshot.durationSeconds)} · 体力 {snapshot.result.energy || 0} · 经验 {snapshot.result.experience || 0} · 击败 {snapshot.result.kills || 0}</p></div>
                    {snapshot.canControl && ['preparing','active','paused'].includes(snapshot.status) && <div className="flex gap-3 text-sm font-medium text-orange-700">{snapshot.status === 'paused' && <button disabled={busy} onClick={() => void command('resume')}>检查并接续</button>}<button disabled={busy} onClick={() => void command('recall')}>提前召回</button></div>}
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-3"><Fighter entity={snapshot.player} label="居民"/><Fighter entity={snapshot.enemy} label="怪物"/></div>
                <p className="shrink-0 text-xs text-slate-500">{snapshot.reason || (snapshot.nextTickAt ? `下一刻度约 ${new Date(snapshot.nextTickAt).toLocaleTimeString('zh-CN')}` : '正在准备出发')} · 药剂消耗 {Object.values(snapshot.result.potionsUsed || {}).reduce((a,b) => a+b,0)} 瓶 · 携带剩余 {Object.values(snapshot.potions).reduce((a,b) => a+b,0)} 瓶</p>
                <div className="flex shrink-0 gap-1 rounded-full bg-slate-100 p-1">{([['events','战斗动态'],['drops','掉落'],['kills','击败记录']] as const).map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => {setTab(key); following.current = true;}} className={`flex-1 rounded-full px-3 py-2 text-xs ${tab === key ? 'bg-white font-semibold text-orange-700 shadow-sm' : 'text-slate-600'}`}>{label}</button>)}</div>
                <div role="log" aria-label="战报记录" aria-live="off" ref={list} onScroll={() => {if (list.current) following.current = list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight < 40;}} className="scrollbar-hide min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4">
                    {tab === 'events' && state.events.map(row => <div key={row.id} className="mb-3 border-b border-slate-100 pb-2 text-xs"><p className="mb-1 text-slate-400">{elapsed(row.elapsedSeconds)}</p>{row.payload.events?.map((event,index) => <p key={index} className="py-0.5 text-slate-700">{actionText(event)}</p>)}{!row.payload.events && <p>{row.payload.report || row.payload.reason || ({request:'已接受探索请求',plan:'准备计划已确认',depart:'出发，装备和药剂已固定',pause:'探索暂停',resume:'人工接续'}[row.kind] || '状态已提交')}</p>}</div>)}
                    {tab === 'drops' && (snapshot.result.rewards || []).map(row => <button key={row.id} onClick={() => {if (row.kind === 'equipment') setGear(row);}} className="mb-3 rounded-xl bg-slate-50 p-3 text-xs"><strong>{row.item.name} {row.quantity ? `×${row.quantity}` : ''}</strong><p className="mt-1 text-slate-500">{elapsed(row.elapsedSeconds)} · {row.kind === 'equipment' ? '点击查看装备属性' : '材料可出售给商店'}</p></button>)}
                    {tab === 'kills' && state.events.flatMap(row => (row.payload.events || []).filter(e => e.kind === 'kill').map((event,index) => <p key={`${row.id}:${index}`} className="mb-3 text-xs">{elapsed(row.elapsedSeconds)} · {actionText(event)}</p>))}
                    {snapshot.result.report && <p className="mt-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{snapshot.result.report}</p>}
                </div>
            </> : <p className="p-6 text-sm text-slate-500">读取最后确认的探索状态…</p>}
        </div>
        {gear && <WorldDialog title="掉落装备" size="compact" onClose={() => setGear(null)}><EquipmentCard item={{id:gear.equipmentId || gear.id,snapshot:gear.item as EquipmentSnapshot,bound:false,locked:false,value:String(gear.item.value || 0)}}/></WorldDialog>}
    </WorldDialog>;
}
