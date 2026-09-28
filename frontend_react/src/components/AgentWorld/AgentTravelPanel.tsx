import {useEffect, useState} from 'react';
import {MapPin, Package, RefreshCw} from 'lucide-react';
import {useAgentTravel} from '../../hooks/useAgentTravel';
import {getTravel} from '../../api/travel';
import type {TravelJourney} from '../../types/api/travel';
import TravelDetailDialog, {travelStatus, travelPhase} from './TravelDetailDialog';
import {useToast} from '../common/ToastProvider';

export default function AgentTravelPanel({agentId, journeyId}: {agentId: string; journeyId?: string}) {
    const data = useAgentTravel(agentId);
    const [tab, setTab] = useState<'travel' | 'inventory'>('travel');
    const [selected, setSelected] = useState<TravelJourney | null>(null);
    const [opening, setOpening] = useState(false);
    const toast = useToast();
    useEffect(() => {
        if (!journeyId) return;
        let live = true;
        getTravel(journeyId).then(row => {if (live) setSelected(row);}).catch(e => {if (live) toast.error(e instanceof Error ? e.message : '旅行详情读取失败');});
        return () => {live = false;};
    }, [journeyId, toast]);
    const open = async (id: string) => {setOpening(true); try {setSelected(await getTravel(id));} catch (e) {toast.error(e instanceof Error ? e.message : '读取旅行详情失败');} finally {setOpening(false);}};
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div className="inline-flex rounded-full bg-slate-100 p-1">{(['travel', 'inventory'] as const).map(value => <button key={value} type="button" onClick={() => setTab(value)} className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs ${tab === value ? 'bg-white font-semibold text-orange-600 shadow-sm' : 'text-slate-500'}`}>{value === 'travel' ? <MapPin className="h-3.5 w-3.5"/> : <Package className="h-3.5 w-3.5"/>}{value === 'travel' ? '旅行经历' : '纪念品背包'}</button>)}</div><button type="button" aria-label="刷新旅行" onClick={data.reload} className="rounded-lg p-2 text-slate-400 hover:bg-orange-50"><RefreshCw className="h-4 w-4"/></button></div>
        {data.loading ? <p className="py-12 text-center text-sm text-slate-400">正在整理旅行记录…</p> : data.error ? <p className="py-8 text-sm text-red-600">{data.error}</p> : tab === 'travel' ? <div className="mt-5 space-y-3">{data.travels.length ? data.travels.map(journey => <button key={journey.id} type="button" disabled={opening} onClick={() => void open(journey.id)} className="block w-full rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-orange-200 hover:bg-orange-50/30 disabled:opacity-50"><div className="flex flex-wrap justify-between gap-2"><p className="text-sm font-semibold text-slate-800">{journey.snapshot.agentName} · {journey.snapshot.selected ? `${journey.snapshot.selected.country} / ${journey.snapshot.selected.city}` : '正在选择目的地'}</p><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700">{travelStatus[journey.status] || journey.status}</span></div><p className="mt-2 text-xs text-slate-500">{travelPhase[journey.phase] || (journey.phase.startsWith('visit-') ? '景点游览' : '旅途遭遇')} · {new Date(journey.createdAt).toLocaleString()}</p>{journey.snapshot.selection && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{journey.snapshot.selection.reason}</p>}</button>) : <p className="py-10 text-center text-sm text-slate-400">还没有旅行经历，先在 Agent 设置中配置旅行任务。</p>}</div> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{data.inventory.length ? data.inventory.map(item => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"><p className="text-sm font-semibold text-slate-800">{item.name}<span className="ml-2 text-orange-600">×{item.quantity}</span></p><p className="mt-2 text-xs text-slate-500">来自 {item.source.destination?.city || '旅行'} · 单价 {item.source.unitPrice || '—'} 世界币</p></div>) : <p className="py-10 text-center text-sm text-slate-400 sm:col-span-2">背包空空的，旅行中可以选择纪念品，也可以不买。</p>}</div>}
        {selected && <TravelDetailDialog journey={selected} onClose={() => setSelected(null)} onChanged={data.reload}/>}
    </section>;
}
