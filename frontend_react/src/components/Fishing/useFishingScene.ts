import {useEffect, useRef, useState} from 'react';
import {getFishingTrip} from '../../api/fishing';
import type {FishingTrip} from '../../types/api/fishing';
import {FishingSceneRenderer} from './scene/FishingSceneRenderer';
import {FishingEventCursor, toFishingSceneState, type FishingSceneCue, type FishingSpot} from './scene/sceneModel';

export function useFishingScene(trip: FishingTrip | undefined, spot: FishingSpot, onComplete: (id: string) => void) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const renderer = useRef<FishingSceneRenderer | null>(null);
    const [detail, setDetail] = useState<FishingTrip>();
    const observedTrip = detail?.id === trip?.id ? detail : trip;
    const [cue, setCue] = useState<FishingSceneCue | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [failed, setFailed] = useState(false);
    const [eventError, setEventError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const {spot: sceneSpot, mode, actorId} = toFishingSceneState(observedTrip, spot);
    const tripId = trip?.id;
    useEffect(() => {
        if (!canvasRef.current) return;
        let alive = true;
        try {
            const instance = new FishingSceneRenderer(canvasRef.current, next => {if (alive) setCue(next);}, () => {if (alive) setPreviewing(false);});
            renderer.current = instance;
        } catch {
            queueMicrotask(() => {if (alive) setFailed(true);});
        }
        return () => {alive = false; renderer.current?.dispose(); renderer.current = null;};
    }, [tripId, attempt]);
    useEffect(() => {
        renderer.current?.setState({spot: sceneSpot, mode, actorId});
    }, [sceneSpot, mode, actorId, tripId, attempt]); // 只投影影响场景的字段，轮询不会重建画布。
    useEffect(() => {
        const controller = new AbortController();
        const cursor = new FishingEventCursor();
        let pending = false;
        queueMicrotask(() => {if (!controller.signal.aborted) {setCue(null); setEventError(false);}});
        if (!tripId) return () => controller.abort();
        const refresh = async () => {
            if (pending || document.hidden || controller.signal.aborted) return;
            pending = true;
            try {
                const detail = await getFishingTrip(tripId, 1, controller.signal);
                if (!controller.signal.aborted) {
                    setDetail(detail);
                    renderer.current?.enqueue(cursor.consume(detail.events));
                    setEventError(false);
                    if (detail.status === 'completed' || detail.status === 'cancelled') {
                        window.clearInterval(timer);
                        const finish = () => {if (!controller.signal.aborted) onComplete(tripId);};
                        // 终态详情包含最后一竿；等整个队列排空，不能在单个 cue 结束时释放。
                        if (renderer.current) renderer.current.afterPlayback(finish);
                        else finish();
                    }
                }
            } catch {if (!controller.signal.aborted) setEventError(true);}
            finally {pending = false;}
        };
        const timer = window.setInterval(() => void refresh(), 5000);
        void refresh();
        return () => {controller.abort(); window.clearInterval(timer);};
    }, [tripId, attempt, onComplete]);
    return {observedTrip, canvasRef, cue, failed, eventError, previewing,
        preview: () => {if (renderer.current) {setPreviewing(true); renderer.current.playPreview();}},
        retry: () => {setPreviewing(false); setFailed(false); setAttempt(value => value + 1);}};
}
