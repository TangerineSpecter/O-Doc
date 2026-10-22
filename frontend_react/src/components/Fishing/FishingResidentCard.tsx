import type {FishingResident, FishingTrip} from '../../types/api/fishing';
import LevelPlate from '../AgentWorld/LevelPlate';
import {BaitPortrait} from './BaitPortrait';

export function FishingResidentCard({resident, trip}: {resident: FishingResident; trip?: FishingTrip}) {
    const progress = resident.needed ? Math.max(0, Math.min(100, resident.progress / resident.needed * 100)) : 100;
    const status = !trip ? '未出钓' : trip.status === 'duel' ? '鱼王对决' : trip.status === 'paused' ? '等待重试' : trip.status === 'preparing' ? '准备出发' : '垂钓中';
    return <article className="fishing-resident-card rounded-xl border border-slate-200/80 bg-white p-2">
        <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-teal-900/10 bg-[#eef4ed] text-sm font-bold text-teal-800" aria-hidden="true">{Array.from(resident.name)[0] || '钓'}</span>
            <div className="min-w-0 flex-1"><h4 className="truncate text-xs font-bold text-slate-800">{resident.name}</h4><p className={`mt-0.5 flex items-center gap-1 text-[9px] ${trip ? 'text-teal-700' : 'text-slate-400'}`}><span className={`h-1 w-1 rounded-full ${trip ? 'bg-teal-500' : 'bg-slate-300'}`}/>{status}<span className="mx-0.5 text-slate-200">·</span><span className="text-slate-400" title={`当前可去 ${resident.spots.length} 个钓点`}>普通钓竿</span></p></div>
            <LevelPlate level={resident.level} variant="emerald" size="sm"/>
        </div>
        <div className="mt-1.5 flex items-center gap-2"><div role="progressbar" aria-label={`${resident.name}钓鱼经验`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-[width]" style={{width: `${progress}%`}}/></div><span className="shrink-0 font-mono text-[9px] tabular-nums text-slate-400">{resident.needed ? `${resident.progress} / ${resident.needed}` : '已满级'}</span></div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{resident.baits.length ? resident.baits.map(b => <span key={b.id} className="inline-flex items-center gap-1 rounded-md border border-slate-100 bg-slate-50/70 px-1 py-0.5 text-[10px] text-slate-600"><BaitPortrait baitId={b.id} className="h-5 w-5"/>{b.name}<strong className="font-semibold tabular-nums text-teal-800">×{b.quantity}</strong></span>) : <span className="text-[10px] leading-4 text-slate-400">{trip?.carried.some(b => b.quantity > 0) ? '鱼饵已随出钓携带，剩余返程后退回' : '暂无鱼饵，等待市场补充'}</span>}</div>
    </article>;
}
