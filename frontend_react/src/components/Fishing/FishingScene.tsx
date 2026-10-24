import {useCallback, useEffect, useState} from 'react';
import {MapPin, Play, Waves} from 'lucide-react';
import type {FishingTrip} from '../../types/api/fishing';
import {fishingSpotLabels} from './presentation';
import {toFishingSceneState, type FishingSpot} from './scene/sceneModel';
import {useFishingScene} from './useFishingScene';
import {Select} from '../common/Select';
import {fishingSpots, fishingSpotOptions} from './spotVisuals';

const modeLabels = {idle: '静候出发', preparing: '岸边准备', fishing: '正在垂钓', duel: '鱼王拉锯', paused: '等待继续', returned: '本次已返程'};
export function FishingScene({trips, enabled}: {trips: FishingTrip[]; enabled: boolean}) {
    const [observation, setObservation] = useState<{trip?: FishingTrip; released: Set<string>}>(() => ({trip: trips[0], released: new Set()}));
    const [spot, setSpot] = useState<FishingSpot>('pond');
    const available = trips.filter(item => !observation.released.has(item.id));
    // 保留观察快照，活动列表移除或历史翻页均不能改变画布的生命周期。
    const trip = observation.trip || available[0];
    useEffect(() => {
        if (!trip || observation.trip) return;
        let alive = true;
        queueMicrotask(() => {if (alive) setObservation(current => ({...current, trip}));});
        return () => {alive = false;};
    }, [trip, observation.trip]);
    const complete = useCallback((id: string) => {
        setObservation(current => current.trip?.id !== id ? current : {
            trip: undefined, released: new Set([...current.released, id]),
        });
    }, []);
    return <FishingSceneView key={trip?.id || 'empty'} trip={trip} trips={available} spot={spot} enabled={enabled}
        onSelect={id => setObservation(current => ({...current, trip: available.find(item => item.id === id)}))}
        onSpot={setSpot} onComplete={complete}/>;
}
function FishingSceneView({trip: initialTrip, trips, spot, enabled, onSelect, onSpot, onComplete}: {
    trip?: FishingTrip; trips: FishingTrip[]; spot: FishingSpot; enabled: boolean;
    onSelect: (id: string) => void; onSpot: (spot: FishingSpot) => void; onComplete: (id: string) => void;
}) {
    const {observedTrip: trip, canvasRef, cue, failed, eventError, previewing, preview, retry} = useFishingScene(initialTrip, spot, onComplete);
    const view = toFishingSceneState(trip, spot);
    const caught = trip?.catches.reduce((sum, item) => sum + item.quantity, 0) || 0;
    return <section aria-label="像素钓场" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><Waves className="h-4 w-4 text-teal-600"/>像素钓场<span className="ml-1 text-[9px] font-normal tracking-widest text-slate-400">水边观察</span></h3>
            {!trip && <div className="w-44 min-w-0 max-w-full" aria-label="钓场景观"><Select value={spot} onChange={onSpot} options={fishingSpotOptions} menuPortal={true} accentClassName="text-teal-700 bg-teal-50" buttonClassName="!min-h-8 !py-1 !text-[10px]"/></div>}
            {trip && <span className="text-[10px] text-slate-400">已抛 {trip.casts} 竿<span className="mx-2 text-slate-200">/</span>收获 {caught} 条</span>}
        </div>
        <div className="relative m-2 overflow-hidden rounded-xl border border-[#d0dfc8] bg-[#b9cd83] sm:m-3">
            <canvas ref={canvasRef} role="img" aria-label={`${fishingSpotLabels[view.spot]}像素场景，${trip ? `${trip.actorName}${modeLabels[view.mode]}` : '此刻无人出钓'}`} className="block aspect-[16/9] w-full" style={{imageRendering: 'pixelated'}}/>
            <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1.5 rounded-full border border-white/60 bg-[#fffdf3]/95 px-2.5 py-1.5 text-[10px] text-[#456455] shadow-sm sm:left-3 sm:top-3"><MapPin className="h-3 w-3"/><span className="font-bold">{fishingSpotLabels[view.spot]}</span><span className="hidden text-[#819382] sm:inline">· {fishingSpots[view.spot].description}</span></div>
            {cue && <div role="status" className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 text-center rounded-xl border border-white/60 bg-[#fffdf3]/95 px-4 py-2 text-xs font-semibold text-teal-900 shadow-sm">{cue.label}</div>}
            {failed && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50/95 text-xs text-slate-500">像素场景暂时无法显示<button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-teal-700" onClick={retry}>重新加载场景</button></div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
            <div className="min-w-0 text-[10px] leading-5"><p className="font-semibold text-teal-800">{trip ? `${trip.actorName} · ${modeLabels[view.mode]}` : previewing ? '动画预览 · 不计入出钓与收获' : '水面正静，等待下一次出发'}</p><p className="text-slate-400">{eventError ? '逐竿记录暂时无法读取，正在重连…' : trip ? '抛竿与提鱼随出钓记录呈现，收获以逐竿记录为准。' : enabled ? '居民备好鱼饵后，由生活日程安排出钓。' : '钓鱼尚未启用，可以先看看水岸与挥杆动画。'}</p></div>
            {!trip && <button type="button" onClick={preview} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-[10px] font-semibold text-teal-800 transition-colors hover:bg-teal-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"><Play className="h-3 w-3"/>预览挥杆</button>}
        </div>
        {(trips.length > 1 || trips.length === 1 && trips[0].id !== trip?.id) && <div aria-label="切换观察钓手" className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 py-2 scrollbar-hide">{trips.map(item => <button key={item.id} type="button" aria-pressed={trip?.id === item.id} onClick={() => onSelect(item.id)} className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] ${trip?.id === item.id ? 'border-teal-200 bg-teal-50 font-semibold text-teal-800' : 'border-slate-200 text-slate-500 hover:border-teal-300'}`}>{item.actorName} · {fishingSpotLabels[item.plan.spot || ''] || '准备出发'}</button>)}</div>}
    </section>;
}
