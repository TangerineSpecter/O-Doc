import {useEffect, useState} from 'react';
import {Select} from '../common/Select';
import WorldDialog from '../AgentWorld/WorldDialog';
import {saveLifeGoal, getLifeGoalOptions} from '../../api/agentLife';
import type {LifeCondition, LifeGoal} from '../../types/api/agentLife';
import {goalStatusLabels} from './lifeLabels';
export default function LifeGoalEditor({actorId, goal, onClose, onSaved}: {actorId: string; goal?: LifeGoal; onClose: () => void; onSaved: () => void}) {
    const [title, setTitle] = useState(goal?.title || '');
    const [condition, setCondition] = useState<LifeCondition>(goal?.condition || {kind: 'subjective', description: ''});
    const [status, setStatus] = useState<LifeGoal['status']>(goal?.status || 'active');
    const [progress, setProgress] = useState(goal?.progress || '');
    const [reason, setReason] = useState(goal?.reason || '');
    const [destinationSearch, setDestinationSearch] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [options, setOptions] = useState<{destinations: {id: string; city: string; country: string}[]; items: {sku: string; name: string}[]}>({destinations: [], items: []});
    useEffect(() => {const c = new AbortController(); const timer = window.setTimeout(() => {void getLifeGoalOptions(c.signal, destinationSearch, goal?.condition.destinationId || '').then(v => {if (!c.signal.aborted) setOptions(v);}).catch(e => {if (!c.signal.aborted) setError(e.message || '完成条件选项加载失败');});}, 250); return () => {window.clearTimeout(timer); c.abort();};}, [destinationSearch, goal?.condition.destinationId]);
    const save = async () => {setBusy(true); setError(''); try {await saveLifeGoal({id: goal?.id, actorId, title, condition, status, progress, reason}); onSaved();} catch(e) {setError(e instanceof Error ? e.message : '目标保存失败');} finally {setBusy(false);}};
    return <WorldDialog title={goal ? '编辑生活目标' : '新增生活目标'} onClose={onClose}>
        <div className="space-y-4 p-6">
            <p className="text-sm text-slate-500">完成日期可以未知。完成或放弃后退出后续待办，历史继续保留。</p>
            <label className="block space-y-2 text-sm"><span>目标</span><input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} className="w-full rounded-xl border border-slate-200 p-3"/></label>
            <label className="block space-y-2 text-sm"><span>完成条件</span><Select menuPortal value={condition.kind} options={[{value: 'subjective', label: '居民判断并引用实际经历'}, {value: 'savings', label: '现金达到目标金额'}, {value: 'travel', label: '完成指定目的地旅行'}, {value: 'inventory', label: '持有指定数量物品'}]} onChange={kind => setCondition({kind: kind as LifeCondition['kind']})}/></label>
            {condition.kind === 'subjective' && <label className="block space-y-2 text-sm"><span>怎样才算完成</span><textarea value={condition.description || ''} onChange={e => setCondition({...condition, description: e.target.value})} rows={2} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"/></label>}
            {condition.kind === 'savings' && <label className="block space-y-2 text-sm"><span>目标金额</span><input type="number" min="0.01" step="0.01" value={condition.amount || ''} onChange={e => setCondition({...condition, amount: e.target.value})} className="w-full rounded-xl border border-slate-200 p-3"/></label>}
            {condition.kind === 'travel' && <label className="block space-y-2 text-sm"><span>搜索目的地（城市或国家）</span><input value={destinationSearch} onChange={e => setDestinationSearch(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3" placeholder="输入城市或国家，显示前100个结果"/></label>}
            {condition.kind === 'travel' && <label className="block space-y-2 text-sm"><span>目的地</span><Select menuPortal value={condition.destinationId || ''} options={options.destinations.map(v => ({value: v.id, label: `${v.country} · ${v.city}`}))} onChange={v => setCondition({...condition, destinationId: v})} placeholder="选择旅行目的地"/></label>}
            {condition.kind === 'inventory' && <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-2 text-sm"><span>物品</span><Select menuPortal value={condition.sku || ''} options={options.items.map(v => ({value: v.sku, label: v.name}))} onChange={v => setCondition({...condition, sku: v})} placeholder="选择物品"/></label><label className="space-y-2 text-sm"><span>数量</span><input type="number" min={1} value={condition.quantity || 1} onChange={e => setCondition({...condition, quantity: Number(e.target.value)})} className="w-full rounded-xl border border-slate-200 p-3"/></label></div>}
            <label className="block space-y-2 text-sm"><span>状态</span><Select menuPortal value={status} options={Object.entries(goalStatusLabels).map(([value, label]) => ({value, label}))} onChange={v => setStatus(v as LifeGoal['status'])}/></label>
            <label className="block space-y-2 text-sm"><span>当前进展</span><textarea value={progress} onChange={e => setProgress(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"/></label>
            <label className="block space-y-2 text-sm"><span>调整原因（结束或暂停必填）</span><textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all"/></label>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="button" disabled={busy || !title.trim()} onClick={() => void save()} className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm text-white disabled:opacity-50">{busy ? '保存中…' : '保存目标'}</button>
        </div>
    </WorldDialog>;
}
