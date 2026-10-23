import {ArrowUpRight, Clock, Crown, Fish, MapPin, RotateCw, Undo2} from 'lucide-react';
import type {FishingTrip} from '../../types/api/fishing';
import {BaitPortrait} from './BaitPortrait';
import {FishPortrait} from './FishPortrait';
import {fishArtIdForName} from './fishVisuals';
import {fishingSpotLabels, fishingTime} from './presentation';
const labels: Record<FishingTrip['status'], string> = {preparing: '准备出钓', active: '正在垂钓', duel: '鱼王对决', paused: '等待重试', completed: '已返回', cancelled: '已提前返回'};

export function FishingTripCard({trip, now, busy, onSelect, onAction}: {
    trip: FishingTrip; now: number; busy: boolean; onSelect: () => void;
    onAction: (kind: 'retry' | 'recall') => void;
}) {
    const remaining = trip.deadline ? Math.max(0, Math.ceil((Date.parse(trip.deadline) - now) / 60000)) : null;
    const hasKing = Boolean(trip.duel) || trip.catches.some(c => c.name.includes('王'));
    const caught = trip.catches.reduce((count, item) => count + item.quantity, 0);
    return <article
        onClick={onSelect}
        className={`fishing-trip-card group cursor-pointer overflow-hidden rounded-2xl border bg-white transition-all hover:border-teal-300 hover:shadow-md ${trip.duel ? 'border-amber-200' : 'border-slate-200/90'}`}
    >
        <div className="flex items-start gap-3 p-3">
            <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${hasKing ? 'border-amber-200/90 bg-gradient-to-br from-amber-50 to-amber-100/50' : 'border-teal-200/70 bg-gradient-to-br from-[#eff6ef] via-[#f5f9f3] to-white'} shadow-2xs`}>
                <span className="font-mono text-xl font-black text-teal-800" aria-hidden="true">
                    {Array.from(trip.actorName)[0] || '钓'}
                </span>
                {hasKing && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-2xs" title="遇见或捕获鱼王">
                        <Crown className="h-3 w-3"/>
                    </span>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                        <span>{trip.actorName}</span>
                        <span className="text-[10px] font-normal text-slate-400">· 出钓手札</span>
                    </h4>
                    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-semibold ${trip.duel ? 'border-amber-200 bg-amber-50 text-amber-700' : trip.endedAt ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-teal-200 bg-teal-50 text-teal-700'}`}><span className={`h-1 w-1 rounded-full ${trip.duel ? 'bg-amber-500' : trip.endedAt ? 'bg-slate-400' : 'bg-teal-500'}`}/>{!trip.endedAt && !trip.authorized ? '等待本机授权' : labels[trip.status]}</span>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-400"><span className="inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5 text-teal-600"/>{fishingSpotLabels[trip.plan.spot || ''] || '选择钓点中'}</span><span>已抛竿 {trip.casts} 次</span></p>
                <p className="mt-1 text-[9px] text-slate-400">{fishingTime(trip.endedAt || trip.departedAt || trip.createdAt)}</p>
            </div>
        </div>
        <div className="space-y-2 px-3 pb-3">
            {!trip.endedAt && remaining !== null && <p className="flex items-center gap-1.5 rounded-lg border border-teal-100/60 bg-teal-50/50 px-2 py-1.5 text-[10px] text-teal-700"><Clock className="h-3 w-3 shrink-0"/>{remaining ? `预计 ${remaining} 分钟后返回` : trip.duel ? '返程时间已到，完成当前鱼王对决后返回' : '正在返程结算'}</p>}
            {trip.duel && <div className="rounded-xl border border-amber-200/60 bg-amber-50/70 px-2.5 py-2"><div className="flex items-center justify-between"><p className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800"><Crown className="h-3.5 w-3.5"/>鱼王对决 · 第 {trip.duel.round + 1} 局</p></div><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs"><span className="text-teal-700">胜 {Array.from({length: 3}, (_, i) => i < trip.duel!.wins ? '●' : '○').join(' ')}</span><span className="text-rose-600">负 {Array.from({length: 3}, (_, i) => i < trip.duel!.losses ? '●' : '○').join(' ')}</span></div><p className="mt-1.5 text-[9px] text-amber-600">累计三胜捕获 · 三败逃脱 · 平局继续</p></div>}
            {trip.carried.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="text-[9px] text-slate-400">{trip.endedAt ? '鱼饵记录' : '携带鱼饵'}</span>{trip.carried.map((p, index) => <span key={`${p.sku}-${index}`} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1 py-0.5 text-[10px] text-slate-500"><BaitPortrait baitId={p.sku} className="h-5 w-5"/>{p.name} × {p.quantity}</span>)}</div>}
            {trip.error && <p className="rounded-lg bg-rose-50 px-2 py-1.5 text-[10px] leading-4 text-rose-600">{trip.error}</p>}
            {!trip.authorized && !trip.endedAt && <p className="text-[10px] leading-4 text-amber-700">出钓已暂停：检查统一生活运行开关后，点击「继续出钓」。</p>}
            {trip.reason && <p className="text-[10px] leading-4 text-slate-400">{trip.reason}</p>}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-slate-200/70 pt-2">{trip.catches.length ? trip.catches.map(c => {
                const id = fishArtIdForName(c.name);
                return <span key={c.name} className="inline-flex items-center gap-1 rounded-lg border border-teal-100/60 bg-teal-50/50 px-1.5 py-0.5 text-[10px] text-slate-600">{id ? <FishPortrait fishId={id} name={c.name} decorative className="h-6 w-6"/> : <Fish className="h-3 w-3 text-teal-500"/>}{c.name}<strong className="font-semibold text-teal-800">×{c.quantity}</strong></span>;
            }) : <span className="text-[10px] text-slate-400">{trip.endedAt ? '本次没有收获' : '等待第一次收获'}</span>}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/50 px-3 py-2">
            <span className="mr-auto text-[10px] text-slate-400">收获 <strong className="font-semibold text-slate-700">{caught}</strong> 条{trip.experience > 0 && <span className="ml-2 font-semibold text-amber-600">EXP +{trip.experience}</span>}</span>
            {!trip.endedAt && <><button type="button" disabled={busy} onClick={e => {e.stopPropagation(); onAction('recall');}} className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-40"><Undo2 className="h-3 w-3"/>提前返回</button>{(trip.status === 'paused' || !trip.authorized) && <button type="button" disabled={busy} onClick={e => {e.stopPropagation(); onAction('retry');}} className="inline-flex items-center gap-1 text-[10px] font-medium text-teal-700 disabled:opacity-40"><RotateCw className="h-3 w-3"/>继续出钓</button>}</>}
            <button
                type="button"
                onClick={e => {e.stopPropagation(); onSelect();}}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 shadow-sm transition-all hover:border-teal-300 hover:bg-teal-100 active:scale-95 group-hover:bg-teal-700 group-hover:text-white group-hover:border-teal-700"
            >
                <span>查看过程</span>
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"/>
            </button>
        </div>
    </article>;
}
