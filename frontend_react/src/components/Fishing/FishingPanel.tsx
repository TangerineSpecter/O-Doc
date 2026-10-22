import {useEffect, useState} from 'react';
import {AlertCircle, BookOpen, Fish, RefreshCw, Users, Waves} from 'lucide-react';
import {useFishing, useFishingConfig} from '../../hooks/useFishing';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {FishingTripCard} from './FishingTripCard';
import {FishingTripDetails} from './FishingTripDetails';
import {FishingResidentCard} from './FishingResidentCard';
import {FishPortrait} from './FishPortrait';
import './fishingAtlas.css';

export function FishingSettings() {
    const {enabled, loading, busy, error, toggle} = useFishingConfig();
    return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-4"><div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Fish className="h-4 w-4 text-teal-600"/>居民钓鱼<DecisionProcessInfo kind="fishing"/></h3><p className="mt-2 text-xs leading-6 text-slate-500">由生活日程安排出钓，决策连接选择钓点、时长及最多三种鱼饵。居民沿用统一生活参与范围。</p></div><button type="button" role="switch" aria-checked={enabled} aria-label="启用居民钓鱼" disabled={loading || busy} onClick={() => void toggle()} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${enabled ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{loading ? '读取中' : busy ? '保存中' : enabled ? '已启用' : '未启用'}</button></div><p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-6 text-slate-500">普通钓竿默认装备。鱼饵需要居民先在市场购买，商店每小时随机供应一种，不限数量。每五分钟消耗一份鱼饵和两点体力。关闭能力会结束当前出钓并退回剩余鱼饵。</p>{error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}</section>;
}

export function FishingPanel({initialTripId = ''}: {initialTripId?: string}) {
    const state = useFishing(true, initialTripId);
    const [now, setNow] = useState(Date.now);
    useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer);}, []);
    const {data} = state;
    return <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="fishing-atlas-header flex shrink-0 items-center gap-3 rounded-2xl border p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-900/10 bg-teal-800 text-teal-50 shadow-sm"><Fish className="h-5 w-5"/></span>
            <div className="min-w-0 flex-1"><h2 className="flex items-center gap-2 text-sm font-bold text-teal-900">水边的慢时光<DecisionProcessInfo kind="fishing"/></h2><p className="mt-1 text-[10px] text-slate-400">等待一次咬钩，也等待一个新纪录</p></div>
            {data && <dl className="hidden shrink-0 divide-x divide-teal-900/10 sm:flex">{[{label: '参与钓手', value: data.residents.length}, {label: '当前出钓', value: data.active.length}, {label: '出钓档案', value: data.total}].map(item => <div key={item.label} className="px-4 text-center"><dt className="text-[9px] text-slate-400">{item.label}</dt><dd className="mt-0.5 font-mono text-lg font-semibold leading-5 text-teal-800">{item.value}</dd></div>)}</dl>}
            <button type="button" aria-label="刷新钓鱼状态" disabled={state.loading} onClick={state.reload} className="rounded-xl border border-slate-200/80 bg-white/90 p-2 text-slate-400 transition-colors hover:border-teal-300 hover:text-teal-700 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${state.loading ? 'motion-safe:animate-spin' : ''}`}/></button>
        </div>
        {state.error && <div role="alert" className="flex shrink-0 items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0"/><span className="flex-1">{state.error}</span><button type="button" className="font-medium" onClick={state.reload}>重试</button></div>}
        {state.loading && !data && <p role="status" className="py-12 text-center text-sm text-slate-400">正在读取水边见闻…</p>}
        {state.selected ? <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">{state.detail ? <FishingTripDetails trip={state.detail} loading={state.loading} onBack={() => state.choose('')} onPage={state.setEventPage}/> : <div className="py-8 text-center text-xs text-slate-400">{state.error ? '过程读取失败' : '正在读取出钓过程…'}<button type="button" className="ml-3 text-teal-700" onClick={() => state.choose('')}>返回列表</button></div>}</div> : data && <>
            {!data.enabled && <p className="shrink-0 rounded-xl border border-amber-100 bg-amber-50 p-2.5 text-[11px] text-amber-700">钓鱼尚未启用，可在世界管理 → 钓鱼中开启。</p>}
            <div className="grid min-h-0 flex-1 auto-rows-max gap-4 overflow-y-auto scrollbar-hide lg:auto-rows-auto lg:grid-cols-[244px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]">
                <section aria-label="居民钓鱼成长" className="flex min-h-0 flex-col">
                    <div className="mb-2 flex shrink-0 items-center gap-1.5"><Users className="h-3.5 w-3.5 text-teal-600"/><h3 className="text-xs font-bold text-slate-700">钓手档案</h3><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{data.residents.length}</span></div>
                    <div className="grid min-h-0 gap-1.5 scrollbar-hide sm:grid-cols-2 lg:block lg:space-y-1.5 lg:overflow-y-auto lg:pr-0.5">{data.residents.map(resident => <FishingResidentCard key={resident.id} resident={resident} trip={data.active.find(trip => trip.actorId === resident.id)}/>)}</div>
                    {!data.residents.length && <p className="rounded-xl border border-dashed border-slate-200 p-4 text-[11px] leading-5 text-slate-400">还没有参与钓鱼的居民，参与范围沿用统一生活配置。</p>}
                </section>
                <div className="min-h-0 space-y-4 scrollbar-hide lg:overflow-y-auto lg:pr-0.5">
                    <section aria-label="当前出钓">
                        <div className="mb-2 flex items-center gap-1.5"><Waves className="h-3.5 w-3.5 text-teal-600"/><h3 className="text-xs font-bold text-slate-700">当前出钓</h3><span className="rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-teal-700">{data.active.length}</span><span className="ml-auto text-[9px] text-slate-400">由生活日程安排</span></div>
                        {data.active.length ? <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">{data.active.map(trip => <FishingTripCard key={trip.id} trip={trip} now={now} busy={state.busy} onSelect={() => state.choose(trip.id)} onAction={kind => void state.action(trip.id, kind)}/>)}</div> : <div className="fishing-bank-empty flex items-center gap-3 rounded-2xl border border-teal-900/10 p-3">
                            <div className="fishing-atlas-plate flex h-16 w-16 shrink-0 items-center justify-center rounded-xl"><FishPortrait fishId="crucian" name="鱼" decorative className="h-16 w-16"/></div>
                            <div><h4 className="text-xs font-semibold text-teal-800">水面正静，等待下一次出发</h4><p className="mt-1 text-[10px] leading-5 text-slate-400">此刻无人垂钓，准备好鱼饵后由生活日程安排出发。</p><p className="mt-1 text-[9px] text-teal-700/70">市场备饵<span className="mx-2 opacity-40">→</span>日程安排<span className="mx-2 opacity-40">→</span>水边垂钓</p></div>
                        </div>}
                    </section>
                    <section aria-label="出钓档案">
                        <div className="mb-2 flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5 text-teal-600"/><h3 className="text-xs font-bold text-slate-700">出钓档案</h3><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{data.total}</span><span className="ml-auto text-[9px] text-slate-400">每次出钓，一页手札</span></div>
                        {data.items.length ? <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">{data.items.map(trip => <FishingTripCard key={trip.id} trip={trip} now={now} busy={state.busy} onSelect={() => state.choose(trip.id)} onAction={kind => void state.action(trip.id, kind)}/>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-3 py-4"><p className="text-xs font-medium text-slate-500">还没有返程记录</p><p className="mt-1 text-[10px] text-slate-400">收获、经验和每一竿的经历会留在这里。</p></div>}
                        {(data.total > 20 || state.page > 1) && <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400"><button type="button" disabled={state.loading || state.page <= 1} className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-30" onClick={() => state.setPage(p => p - 1)}>上一页</button><span>{state.page} / {Math.max(1, Math.ceil(data.total / 20))}</span><button type="button" disabled={state.loading || state.page * 20 >= data.total} className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-30" onClick={() => state.setPage(p => p + 1)}>下一页</button></div>}
                    </section>
                </div>
            </div>
        </>}
    </div>;
}
