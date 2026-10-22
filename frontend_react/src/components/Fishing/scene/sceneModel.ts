import type {FishingEvent, FishingTrip} from '../../../types/api/fishing';

export type FishingSpot = 'pond' | 'river' | 'lake';
export type SceneMode = 'idle' | 'preparing' | 'fishing' | 'duel' | 'paused' | 'returned';
export interface FishingSceneState {spot: FishingSpot; mode: SceneMode; actorId: string}
export interface FishingSceneCue {id: string; kind: 'catch' | 'empty' | 'escaped' | 'junk'; fishId?: string; label: string}
export const toFishingSpot = (spot?: string): FishingSpot => spot === 'river' || spot === 'lake' ? spot : 'pond';
export function toFishingSceneState(trip?: FishingTrip, spot: FishingSpot = 'pond'): FishingSceneState {
    if (!trip) return {spot, mode: 'idle', actorId: ''};
    const mode: SceneMode = trip.status === 'completed' || trip.status === 'cancelled' ? 'returned'
        : trip.status === 'preparing' ? 'preparing' : trip.status === 'paused' || !trip.authorized ? 'paused'
            : trip.status === 'duel' ? 'duel' : 'fishing';
    return {spot: toFishingSpot(trip.plan.spot), mode, actorId: trip.actorId};
}
export function cueFromEvent(event: FishingEvent): FishingSceneCue | null {
    const caught = event.data.catch;
    if (caught) return {id: event.id, kind: 'catch', fishId: caught.fishId, label: `钓获 ${caught.name} · ${caught.weight} kg`};
    const kind = event.data.outcome?.kind;
    if (event.kind === 'duel_end' || kind === 'escaped') return {id: event.id, kind: 'escaped', label: '鱼儿脱钩，回到水中'};
    if (event.kind === 'cast' && (kind === 'empty' || kind === 'junk')) return {id: event.id, kind, label: kind === 'empty' ? '这一竿没有收获' : `钓起${event.data.outcome?.name || '杂物'}`};
    return null;
}
/** API 按 sequence 倒序；首屏只建立基线，刷新只播放之后新增的事实。 */
export class FishingEventCursor {
    private seen = new Set<string>();
    private initialized = false;
    consume(events: FishingEvent[]): FishingSceneCue[] {
        const fresh = this.initialized ? events.filter(event => !this.seen.has(event.id)).reverse() : [];
        events.forEach(event => this.seen.add(event.id));
        this.initialized = true;
        return fresh.flatMap(event => {const cue = cueFromEvent(event); return cue ? [cue] : [];});
    }
}
