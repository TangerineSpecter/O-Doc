import {useEffect, useState} from 'react';
import WorldDialog from '../AgentWorld/WorldDialog';
import {getLifeItem, changeLifeItem} from '../../api/agentLife';
import type {LifeItem} from '../../types/api/agentLife';
import {activityLabels, statusLabels} from './lifeLabels';
export default function LifeItemDetails({id, onClose, onChanged}: {id: string; onClose: () => void; onChanged: () => void}) {
    const [item, setItem] = useState<LifeItem | null>(null);
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);
    useEffect(() => {const c = new AbortController(); getLifeItem(id, c.signal).then(v => {if (!c.signal.aborted) setItem(v);}).catch(e => {if (!c.signal.aborted) setError(e.message || '详情加载失败');}).finally(() => {if (!c.signal.aborted) setBusy(false);}); return () => c.abort();}, [id]);
    const change = async (action: 'cancel' | 'replan') => {setBusy(true); try {setItem(await changeLifeItem(id, action, reason)); setError(''); onChanged();} catch(e) {setError(e instanceof Error ? e.message : '调整失败');} finally {setBusy(false);}};
    return <WorldDialog title="生活安排详情" onClose={onClose}>
        <div className="space-y-4 p-6">
            {busy && <p className="text-sm text-slate-400">处理中…</p>}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {item && <>
                <div className="rounded-2xl bg-orange-50 p-4"><h4 className="font-semibold">{activityLabels[item.activity] || item.activity} · {statusLabels[item.status] || item.status}</h4><p className="mt-2 text-sm">{new Date(item.scheduledAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}</p><p className="mt-2 text-sm text-slate-600">{item.intent || '尚未固化活动意向'}</p></div>
                <div className="grid grid-cols-2 gap-3 text-sm"><p>预计总预算：{item.budget}</p><p>实际已支出：{item.spent}</p></div>
                {item.result?.reason && <p className="text-sm text-slate-600">实际结果：{item.result.reason}</p>}
                {Array.isArray(item.context?.goals) && <section className="rounded-xl bg-slate-50 p-4"><h5 className="text-sm font-semibold">规划时的有效目标</h5>{item.context.goals.map((value: unknown, index: number) => {const goal = value && typeof value === 'object' ? value as Record<string, unknown> : {}; return <p key={index} className="mt-2 text-sm text-slate-600">{String(goal.title || '生活目标')}{goal.progress ? ` · ${String(goal.progress)}` : ''}</p>;})}</section>}
                <section><h5 className="text-sm font-semibold">调整记录</h5>{!item.revisions?.length && <p className="mt-2 text-sm text-slate-400">暂无调整记录</p>}{item.revisions?.map(r => <div key={r.id} className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'})}</p><p className="mt-1 text-sm">{r.reason}</p><p className="mt-1 text-xs text-slate-500">预算：{String(r.before.budget ?? '—')} → {String(r.after.budget ?? '—')}</p></div>)}</section>
                {['pending', 'deferred', 'paused', 'running'].includes(item.status) && <div className="space-y-3"><label className="block space-y-2 text-sm"><span>调整原因</span><textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3"/></label><div className="flex gap-3"><button type="button" disabled={busy || !reason.trim() || item.status === 'running'} onClick={() => void change('replan')} className="rounded-xl bg-orange-500 px-4 py-2 text-sm text-white disabled:opacity-50">重新规划</button><button type="button" disabled={busy || !reason.trim()} onClick={() => void change('cancel')} className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-50">取消安排</button></div></div>}
            </>}
        </div>
    </WorldDialog>;
}
