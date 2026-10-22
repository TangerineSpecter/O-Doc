import {useEffect, useRef, useState} from 'react';
import {actOnFishingTrip, getFishing, getFishingCatalog, getFishingConfig, getFishingTrip, saveFishingConfig} from '../api/fishing';
import type {FishingCatalog, FishingDetail, FishingOverview} from '../types/api/fishing';
const message = (e: unknown) => e instanceof Error ? e.message : '钓鱼数据读取失败';

export function useFishing(active = true, initialTripId = '') {
    const [data, setData] = useState<FishingOverview | null>(null);
    const [detail, setDetail] = useState<FishingDetail | null>(null);
    const [selected, setSelected] = useState(initialTripId);
    const [page, setPage] = useState(1);
    const [eventPage, setEventPage] = useState(1);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const actionLock = useRef(false);
    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        void (async () => {
            await Promise.resolve();
            if (controller.signal.aborted) return;
            setLoading(true); setError('');
            try {
                const [overview, trip] = await Promise.all([getFishing(page, controller.signal),
                    selected ? getFishingTrip(selected, eventPage, controller.signal) : Promise.resolve(null)]);
                if (!controller.signal.aborted) {setData(overview); setDetail(trip);}
            } catch (e) {if (!controller.signal.aborted) setError(message(e));}
            finally {if (!controller.signal.aborted) setLoading(false);}
        })();
        return () => controller.abort();
    }, [active, page, selected, eventPage, revision]);
    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => {if (!document.hidden) setRevision(v => v + 1);}, 5000);
        return () => window.clearInterval(timer);
    }, [active]);
    const action = async (id: string, kind: 'recall' | 'retry') => {
        if (actionLock.current) return;
        actionLock.current = true; setBusy(true); setError('');
        try {await actOnFishingTrip(id, kind); setRevision(v => v + 1);}
        catch (e) {setError(message(e));}
        finally {actionLock.current = false; setBusy(false);}
    };
    const choose = (id: string) => {setDetail(null); setEventPage(1); setSelected(id);};
    return {data, detail, selected, page, eventPage, loading, error, busy, action, choose,
        setPage, setEventPage, reload: () => setRevision(v => v + 1)};
}

export function useFishingCatalog(actorId = '', active = true) {
    const [data, setData] = useState<FishingCatalog | null>(null);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!active) return;
        const controller = new AbortController();
        void (async () => {
            await Promise.resolve();
            if (controller.signal.aborted) return;
            setLoading(true); setError(''); setData(null);
            try {const value = await getFishingCatalog(actorId, controller.signal); if (!controller.signal.aborted) setData(value);}
            catch (e) {if (!controller.signal.aborted) setError(message(e));}
            finally {if (!controller.signal.aborted) setLoading(false);}
        })();
        return () => controller.abort();
    }, [actorId, active, revision]);
    return {data, error, loading, reload: () => setRevision(v => v + 1)};
}

export function useFishingConfig() {
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const lock = useRef(false);
    useEffect(() => {
        const controller = new AbortController();
        getFishingConfig(controller.signal).then(value => {if (!controller.signal.aborted) setEnabled(value.enabled);})
            .catch(e => {if (!controller.signal.aborted) setError(message(e));})
            .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        return () => controller.abort();
    }, []);
    const toggle = async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try {const value = await saveFishingConfig(!enabled); setEnabled(value.enabled);}
        catch (e) {setError(message(e));}
        finally {lock.current = false; setBusy(false);}
    };
    return {enabled, loading, busy, error, toggle};
}
