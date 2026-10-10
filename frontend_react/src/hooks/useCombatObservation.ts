import {useEffect, useState} from 'react';
import {getCombatSnapshot} from '../api/combat';
import type {CombatEvent, CombatSnapshot} from '../types/api/combat';
import {appendCombatEvents} from '../components/Combat/presentation';
export function useCombatObservation(id: string) {
    const [data, setData] = useState<{id: string; snapshot: CombatSnapshot; events: CombatEvent[]} | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let cursor = 0, active = true, pending = false;
        let controller = new AbortController();
        const load = async () => {
            if (pending || document.hidden) return;
            pending = true;
            controller = new AbortController();
            const signal = controller.signal;
            try {
                do {
                    const snapshot = await getCombatSnapshot(id, cursor, signal);
                    if (!active || signal.aborted) return;
                    cursor = snapshot.nextCursor;
                    setData(previous => ({id, snapshot, events: appendCombatEvents(previous?.id === id ? previous.events : [], snapshot.events)}));
                    setError('');
                    if (!snapshot.hasMore) break;
                } while (active && !document.hidden);
            } catch (e) {if (active && !signal.aborted) setError(e instanceof Error ? e.message : '连接中断');}
            finally {pending = false;}
        };
        setError('');
        void load();
        const timer = window.setInterval(() => {void load();}, 2000);
        const visibility = () => {if (document.hidden) controller.abort(); else void load();};
        document.addEventListener('visibilitychange', visibility);
        return () => {active = false; controller.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visibility);};
    }, [id]);
    return {snapshot: data?.id === id ? data.snapshot : null, events: data?.id === id ? data.events : [], error};
}
