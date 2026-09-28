import {useEffect, useRef, useState} from 'react';
import {actOnTravel, getTravel} from '../api/travel';
import type {TravelJourney, TravelOperation} from '../types/api/travel';

/** 打开的详情独立刷新；操作前发出的查询不能覆盖操作结果。 */
export function useTravelDetail(initial: TravelJourney) {
    const [journey, setJourney] = useState(initial);
    const [error, setError] = useState('');
    const epoch = useRef(0);
    const mutating = useRef(false);
    const refresh = useRef<() => void>(() => undefined);
    useEffect(() => {
        const controller = new AbortController();
        let live = true;
        let inFlight = false;
        setJourney(initial);
        setError('');
        const reload = async () => {
            if (inFlight || mutating.current) return;
            inFlight = true;
            const version = epoch.current;
            try {
                const result = await getTravel(initial.id, controller.signal);
                if (live && version === epoch.current) {setJourney(result); setError('');}
            } catch (e) {
                if (live && version === epoch.current) setError(e instanceof Error ? e.message : '旅行详情刷新失败');
            } finally {
                inFlight = false;
            }
        };
        refresh.current = () => {void reload();};
        void reload();
        const timer = setInterval(() => {void reload();}, 15000);
        return () => {
            live = false;
            epoch.current += 1;
            controller.abort();
            clearInterval(timer);
            refresh.current = () => undefined;
        };
    }, [initial]);
    const act = async (action: TravelOperation, extra?: {assetId?: string; confirmCharge?: boolean}) => {
        const version = ++epoch.current;
        mutating.current = true;
        try {
            const result = await actOnTravel(initial.id, action, extra);
            if (version === epoch.current) {
                setJourney(previous => ({...result, nodes: previous.nodes}));
                setError('');
            }
        } finally {
            mutating.current = false;
            refresh.current();
        }
    };
    return {journey, error, act};
}
