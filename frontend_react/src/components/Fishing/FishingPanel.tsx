import {useOpenTaskAllocation} from '../../hooks/useOpenTaskAllocation';
import {useEffect, useState} from 'react';
import {AlertCircle, ArrowUpRight, BookOpen, Fish, RefreshCw, Users, Waves, X} from 'lucide-react';
import {useFishing} from '../../hooks/useFishing';
import {DecisionProcessInfo} from '../AgentWorld/DecisionProcessInfo';
import {FishingTripCard} from './FishingTripCard';
import {FishingTripDetails} from './FishingTripDetails';
import {FishingResidentCard} from './FishingResidentCard';
import {FishPortrait} from './FishPortrait';
import {FishingScene} from './FishingScene';
import {fishArtIdForName} from './fishVisuals';
import './fishingAtlas.css';

export function FishingPanel({initialTripId = ''}: {initialTripId?: string}) {
    const [selectedActorId, setSelectedActorId] = useState<string | null>(null);
    const state = useFishing(true, initialTripId, selectedActorId || '');
    const selectActor = (id: string | null) => {
        setSelectedActorId(id);
        state.setPage(1);
    };
    const openTasks = useOpenTaskAllocation();
    const [now, setNow] = useState(Date.now);
    const [activeTab, setActiveTab] = useState<'scene' | 'records'>('scene');
    useEffect(() => {const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer);}, []);
    const {data} = state;
    const latestTrip = data?.items[0];

    const filteredItems = state.history?.items || [];
    const historyTotal = state.history?.total || 0;
    const selectedResident = data?.residents.find(r => r.id === selectedActorId);

    return <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="fishing-atlas-header flex shrink-0 items-center gap-3 rounded-2xl border p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-900/10 bg-teal-800 text-teal-50 shadow-sm"><Fish className="h-5 w-5"/></span>
            <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-sm font-bold text-teal-900">水边的慢时光<DecisionProcessInfo kind="fishing"/></h2>
                <p className="mt-1 text-[10px] text-slate-400">等待一次咬钩，也等待一个新纪录</p>
            </div>
            {latestTrip && (
                <button
                    type="button"
                    onClick={() => state.choose(latestTrip.id)}
                    className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-teal-200/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50"
                    title={`快速查看 ${latestTrip.actorName} 最近一次出钓过程`}
                >
                    <BookOpen className="h-3.5 w-3.5 text-teal-600"/>
                    <span>最新手札 · {latestTrip.actorName}</span>
                    <ArrowUpRight className="h-3 w-3 text-teal-600/80"/>
                </button>
            )}
            {data && <dl className="hidden shrink-0 divide-x divide-teal-900/10 sm:flex">{[{label: '参与钓手', value: data.residents.length}, {label: '当前出钓', value: data.active.length}, {label: '出钓档案', value: data.total}].map(item => <div key={item.label} className="px-4 text-center"><dt className="text-[9px] text-slate-400">{item.label}</dt><dd className="mt-0.5 font-mono text-lg font-semibold leading-5 text-teal-800">{item.value}</dd></div>)}</dl>}
            <button type="button" aria-label="刷新钓鱼状态" disabled={state.loading} onClick={state.reload} className="rounded-xl border border-slate-200/80 bg-white/90 p-2 text-slate-400 transition-colors hover:border-teal-300 hover:text-teal-700 disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${state.loading ? 'motion-safe:animate-spin' : ''}`}/></button>
        </div>
        {state.error && <div role="alert" className="flex shrink-0 items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-600"><AlertCircle className="h-3.5 w-3.5 shrink-0"/><span className="flex-1">{state.error}</span><button type="button" className="font-medium" onClick={state.reload}>重试</button></div>}
        {state.loading && !data && <p role="status" className="py-12 text-center text-sm text-slate-400">正在读取水边见闻…</p>}
        {state.selected ? <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide">{state.detail ? <FishingTripDetails trip={state.detail} loading={state.loading} onBack={() => state.choose('')} onPage={state.setEventPage}/> : <div className="py-8 text-center text-xs text-slate-400">{state.error ? '过程读取失败' : '正在读取出钓过程…'}<button type="button" className="ml-3 text-teal-700" onClick={() => state.choose('')}>返回列表</button></div>}</div> : data && <>
            {!data.enabled && <p className="shrink-0 rounded-xl border border-amber-100 bg-amber-50 p-2.5 text-[11px] text-amber-700">钓鱼尚未启用，可在任务分配 → 空档活动中开启。<button type="button" onClick={openTasks} className="ml-2 font-medium underline">前往任务分配</button></p>}
            <div className="grid min-h-0 flex-1 auto-rows-max gap-4 overflow-y-auto scrollbar-hide lg:auto-rows-auto lg:grid-cols-[244px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]">
                <section aria-label="居民钓鱼成长" className="order-2 flex min-h-0 flex-col lg:order-1">
                    <div className="mb-2 flex shrink-0 items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-teal-600"/>
                            <h3 className="text-xs font-bold text-slate-700">钓手档案</h3>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">{data.residents.length}</span>
                        </div>
                        {selectedActorId && (
                            <button
                                type="button"
                                onClick={() => selectActor(null)}
                                className="text-[10px] text-teal-700 hover:text-teal-900 underline underline-offset-2"
                            >
                                查看全部
                            </button>
                        )}
                    </div>
                    <div className="grid min-h-0 gap-1.5 scrollbar-hide sm:grid-cols-2 lg:block lg:space-y-1.5 lg:overflow-y-auto lg:pr-0.5">
                        {data.residents.map(resident => (
                            <FishingResidentCard
                                key={resident.id}
                                resident={resident}
                                trip={data.active.find(trip => trip.actorId === resident.id)}
                                selected={selectedActorId === resident.id}
                                onSelect={() => {
                                    selectActor(selectedActorId === resident.id ? null : resident.id);
                                    setActiveTab('records');
                                }}
                            />
                        ))}
                    </div>
                    {!data.residents.length ? (
                        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-[11px] leading-5 text-slate-400">还没有参与钓鱼的居民，参与范围沿用统一生活配置。</p>
                    ) : (
                        <p className="mt-2 text-[10px] text-slate-400">💡 点击钓手可快速筛选其专属出钓手札</p>
                    )}
                </section>
                <div className="order-1 flex min-h-0 flex-col gap-3 lg:order-2 lg:overflow-hidden">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="inline-flex rounded-full bg-slate-100 p-0.5" role="tablist" aria-label="钓鱼视图切换">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === 'scene'}
                                onClick={() => setActiveTab('scene')}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                                    activeTab === 'scene'
                                        ? 'bg-white font-bold text-teal-800 shadow-sm'
                                        : 'text-slate-500 hover:text-teal-700'
                                }`}
                            >
                                <Waves className="h-3.5 w-3.5"/>
                                <span>水边观察</span>
                                {data.active.length > 0 && (
                                    <span className="rounded-full bg-teal-100 px-1.5 py-0.2 text-[10px] font-bold text-teal-800">
                                        {data.active.length}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={activeTab === 'records'}
                                onClick={() => setActiveTab('records')}
                                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                                    activeTab === 'records'
                                        ? 'bg-white font-bold text-teal-800 shadow-sm'
                                        : 'text-slate-500 hover:text-teal-700'
                                }`}
                            >
                                <BookOpen className="h-3.5 w-3.5"/>
                                <span>出钓手札</span>
                                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                                    activeTab === 'records' ? 'bg-teal-100 text-teal-800' : 'bg-slate-200/80 text-slate-600'
                                }`}>
                                    {data.total}
                                </span>
                            </button>
                        </div>
                        {activeTab === 'records' ? (
                            <span className="text-[10px] text-slate-400">点击卡片可查看完整出钓与对决过程</span>
                        ) : latestTrip ? (
                            <button
                                type="button"
                                onClick={() => state.choose(latestTrip.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900"
                            >
                                <span>查看最新出钓过程 ({latestTrip.actorName})</span>
                                <ArrowUpRight className="h-3 w-3"/>
                            </button>
                        ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 scrollbar-hide">
                        <div className={`space-y-4 ${activeTab === 'scene' ? '' : 'hidden'}`}>
                            <FishingScene trips={data.active} enabled={data.enabled}/>
                            <section aria-label="当前出钓">
                                <div className="mb-2 flex items-center gap-1.5">
                                    <Waves className="h-3.5 w-3.5 text-teal-600"/>
                                    <h3 className="text-xs font-bold text-slate-700">当前出钓</h3>
                                    <span className="rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-teal-700">{data.active.length}</span>
                                    <span className="ml-auto text-[9px] text-slate-400">由生活日程安排</span>
                                </div>
                                {data.active.length ? (
                                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
                                        {data.active.map(trip => (
                                            <FishingTripCard key={trip.id} trip={trip} now={now} busy={state.busy} onSelect={() => state.choose(trip.id)} onAction={kind => void state.action(trip.id, kind)}/>
                                        ))}
                                    </div>
                                ) : latestTrip ? (
                                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-teal-900/10 bg-gradient-to-r from-[#f3f8f2] via-white to-white p-3 shadow-sm">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="fishing-atlas-plate flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
                                                <FishPortrait fishId={latestTrip.catches[0] ? (fishArtIdForName(latestTrip.catches[0].name) || 'crucian') : 'crucian'} name="鱼" decorative className="h-10 w-10"/>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-bold text-slate-800 truncate">水面正静 · 最新出钓 {latestTrip.actorName}</h4>
                                                    <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[9px] font-semibold text-teal-700">已返程</span>
                                                </div>
                                                <p className="mt-0.5 text-[10px] text-slate-500 truncate">
                                                    已抛竿 {latestTrip.casts} 次 · 收获 <strong className="font-semibold text-teal-800">{latestTrip.catches.reduce((c, item) => c + item.quantity, 0)}</strong> 条 · EXP +{latestTrip.experience}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => state.choose(latestTrip.id)}
                                                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 shadow-sm transition-colors hover:bg-teal-100 hover:border-teal-300 active:scale-95"
                                            >
                                                <span>查看过程</span>
                                                <ArrowUpRight className="h-3.5 w-3.5"/>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveTab('records')}
                                                className="text-[11px] text-slate-400 hover:text-teal-700 underline underline-offset-2 ml-1"
                                            >
                                                全部手札 ({data.total}) →
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="fishing-bank-empty flex items-center gap-3 rounded-2xl border border-teal-900/10 p-3">
                                        <div className="fishing-atlas-plate flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"><FishPortrait fishId="crucian" name="鱼" decorative className="h-14 w-14"/></div>
                                        <div>
                                            <h4 className="text-xs font-semibold text-teal-800">水面正静，等待下一次出发</h4>
                                            <p className="mt-1 text-[10px] leading-5 text-slate-400">此刻无人垂钓，准备好鱼饵后由生活日程安排出发。</p>
                                            <p className="mt-1 text-[9px] text-teal-700/70">市场备饵<span className="mx-2 opacity-40">→</span>日程安排<span className="mx-2 opacity-40">→</span>水边垂钓</p>
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>

                        <div className={`space-y-4 ${activeTab === 'records' ? '' : 'hidden'}`}>
                            <section aria-label="出钓档案">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <BookOpen className="h-3.5 w-3.5 text-teal-600"/>
                                        <h3 className="text-xs font-bold text-slate-700">
                                            {selectedResident ? `${selectedResident.name} 的出钓档案` : '出钓档案'}
                                        </h3>
                                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                                            {historyTotal}
                                        </span>
                                        {selectedActorId && (
                                            <button
                                                type="button"
                                                onClick={() => selectActor(null)}
                                                className="ml-1 inline-flex items-center gap-0.5 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
                                            >
                                                <span>显示全部</span>
                                                <X className="h-3 w-3 text-teal-600"/>
                                            </button>
                                        )}
                                    </div>
                                    <span className="ml-auto text-[9px] text-slate-400">
                                        {selectedResident ? `仅展示 ${selectedResident.name} 的出钓记录` : '每次出钓，一页手札 · 可点击左侧钓手筛选'}
                                    </span>
                                </div>
                                {!state.history ? (
                                    <p role="status" className="py-8 text-center text-xs text-slate-400">{state.error ? '出钓手札读取失败，请重试。' : '正在读取出钓手札…'}</p>
                                ) : filteredItems.length ? (
                                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
                                        {filteredItems.map(trip => (
                                            <FishingTripCard key={trip.id} trip={trip} now={now} busy={state.busy} onSelect={() => state.choose(trip.id)} onAction={kind => void state.action(trip.id, kind)}/>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-3 py-8 text-center">
                                        <p className="text-xs font-medium text-slate-500">
                                            {selectedResident ? `${selectedResident.name} 暂无出钓记录` : '还没有返程记录'}
                                        </p>
                                        <p className="mt-1 text-[10px] text-slate-400">
                                            {selectedResident ? '该钓手尚未安排出钓，或已出钓记录尚未结算。' : '收获、经验和每一竿的经历会留在这里。'}
                                        </p>
                                        {selectedActorId && (
                                            <button
                                                type="button"
                                                onClick={() => selectActor(null)}
                                                className="mt-3 rounded-lg border border-teal-200 bg-white px-3 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 shadow-2xs"
                                            >
                                                查看全部钓手手札
                                            </button>
                                        )}
                                    </div>
                                )}
                                {(historyTotal > 20 || state.page > 1) && (
                                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                                        <button type="button" disabled={state.loading || state.page <= 1} className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-30" onClick={() => state.setPage(p => p - 1)}>上一页</button>
                                        <span>{state.page} / {Math.max(1, Math.ceil(historyTotal / 20))}</span>
                                        <button type="button" disabled={state.loading || state.page * 20 >= historyTotal} className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-30" onClick={() => state.setPage(p => p + 1)}>下一页</button>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>
                </div>
            </div>
        </>}
    </div>;
}
