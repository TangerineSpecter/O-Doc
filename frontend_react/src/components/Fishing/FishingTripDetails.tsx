import {ArrowLeft, Check, Crown, Fish, Waves} from 'lucide-react';
import type {FishingDetail, FishingEvent} from '../../types/api/fishing';
import {fishingSpotLabels, fishingTime} from './presentation';
import {FishPortrait} from './FishPortrait';
const moves: Record<string, string> = {rock: '锤子', scissors: '剪刀', paper: '布'};
const outcomes: Record<string, string> = {empty: '空竿，鱼群没有咬钩', junk: '钓到了杂物', fish: '鱼儿咬钩', escaped: '鱼儿挣脱了', king: '遇见了专属鱼王'};
function describe(event: FishingEvent, trip: FishingDetail): string {
    const d = event.data;
    if (d.catch) return `钓获 ${d.catch.name} · ${d.catch.weight} kg · 经验 +${d.catch.experience}`;
    if (event.kind === 'duel_round') return `${moves[d.player || '']} 对 ${moves[d.king || '']} · ${d.result === 'draw' ? '平局' : d.result === 'win' ? '获胜' : '落败'}（${d.wins} 胜 ${d.losses} 负）`;
    if (event.kind === 'duel_end') return '累计三败，鱼王逃脱';
    if (event.kind === 'cast') return `${trip.rules.baits[d.bait || '']?.name || '鱼饵'} · ${d.outcome?.name || outcomes[d.outcome?.kind || ''] || '完成抛竿'}${d.probability !== undefined ? ` · 捕获率 ${(d.probability * 100).toFixed(1)}%` : ''}`;
    if (event.kind === 'choice') {
        if (d.key === 'spot') return `选定钓点：${trip.rules.spots[d.value || '']?.name || d.value}`;
        if (d.key === 'minutes') return `计划垂钓 ${d.value} 分钟`;
        return d.value === 'stop' ? '鱼饵选择结束' : `携带 ${trip.rules.baits[d.value || '']?.name || d.value}`;
    }
    return event.kind === 'depart' ? '携带鱼饵出发，开始等待鱼群' : d.reason || '返程结算';
}
export function FishingTripDetails({trip, loading, onBack, onPage}: {trip: FishingDetail; loading: boolean; onBack: () => void; onPage: (page: number) => void}) {
    const caught = trip.catches.reduce((count, item) => count + item.quantity, 0);
    return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="fishing-atlas-header border-b px-3 py-2.5"><div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-[10px] text-teal-700 hover:text-teal-900"><ArrowLeft className="h-3 w-3"/>返回出钓列表</button><span className="text-[9px] text-slate-400">{fishingTime(trip.departedAt || trip.createdAt)}</span></div><h3 className="mt-2 text-base font-bold text-slate-800">{trip.actorName} · 出钓过程</h3><p className="mt-1 text-[10px] text-slate-400">{fishingSpotLabels[trip.plan.spot || ''] || '准备出发'} · 每一竿，都留有记录</p></div>
        <dl className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100 py-2 text-center"><div><dt className="text-[9px] text-slate-400">累计抛竿</dt><dd className="mt-0.5 text-sm font-semibold text-slate-700">{trip.casts} <span className="text-[9px] font-normal text-slate-400">次</span></dd></div><div><dt className="text-[9px] text-slate-400">本次收获</dt><dd className="mt-0.5 text-sm font-semibold text-teal-700">{caught} <span className="text-[9px] font-normal text-slate-400">条</span></dd></div><div><dt className="text-[9px] text-slate-400">钓鱼经验</dt><dd className="mt-0.5 text-sm font-semibold text-amber-600">+{trip.experience}</dd></div></dl>
        <ol className="divide-y divide-dashed divide-slate-100">{trip.events.map(event => {
            const catchResult = event.data.catch;
            const isDuel = event.kind.startsWith('duel');
            return <li key={event.id} className={`flex gap-3 px-3 py-2.5 ${catchResult ? 'bg-teal-50/30' : isDuel ? 'bg-amber-50/30' : ''}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${catchResult?.king || isDuel ? 'border-amber-100 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                    {catchResult ? <FishPortrait fishId={catchResult.fishId} name={catchResult.name} decorative className="h-8 w-8"/> : isDuel ? <Crown className="h-3.5 w-3.5 text-amber-500"/> : event.kind === 'cast' ? <Fish className="h-3.5 w-3.5 text-teal-600"/> : event.kind === 'choice' ? <Check className="h-3.5 w-3.5 text-slate-400"/> : <Waves className="h-3.5 w-3.5 text-teal-500"/>}
                </span>
                <div className="min-w-0 flex-1"><p className="text-xs leading-5 text-slate-700">{catchResult?.king && <Crown className="mr-1 inline h-3 w-3 text-amber-500"/>}{describe(event, trip)}</p><p className="mt-0.5 text-[9px] text-slate-400">{fishingTime(event.createdAt)}</p></div>
            </li>;
        })}</ol>
        {!trip.events.length && <p className="py-8 text-center text-xs text-slate-400">正在准备，尚无过程记录</p>}
        {(trip.eventTotal > 30 || trip.eventPage > 1) && <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3 py-2 text-[10px] text-slate-400"><button type="button" disabled={loading || trip.eventPage <= 1} onClick={() => onPage(trip.eventPage - 1)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-30">上一页</button><span>{trip.eventPage} / {Math.max(1, Math.ceil(trip.eventTotal / 30))}</span><button type="button" disabled={loading || trip.eventPage * 30 >= trip.eventTotal} onClick={() => onPage(trip.eventPage + 1)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 disabled:opacity-30">下一页</button></div>}
    </section>;
}
