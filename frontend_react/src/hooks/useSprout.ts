import {useCallback, useEffect, useRef, useState} from 'react';
import {cancelSprout, createSprout, deleteSprout, getSprout, getSproutOptions, getSprouts, regenerateSprout} from '../api/sprout';
import type {SproutInput, SproutOptions, SproutRecord} from '../types/api/sprout';

export function useSprout() {
    const [records, setRecords] = useState<SproutRecord[]>([]);
    const [active, setActive] = useState<SproutRecord | null>(null);
    const [options, setOptions] = useState<SproutOptions>({models: [], tools: []});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const sequence = useRef(0);
    const mounted = useRef(true);
    const refresh = useCallback(async () => {
        const rows = await getSprouts();
        if (mounted.current) setRecords(rows);
        return rows;
    }, []);
    useEffect(() => {
        mounted.current = true;
        Promise.all([refresh(), getSproutOptions()]).then(([rows, config]) => {
            if (!mounted.current) return;
            setOptions(config);
            const id = localStorage.getItem('memo-active-sprout');
            setActive(rows.find(row => row.id === id) || rows.find(row => ['pending', 'running'].includes(row.status)) || null);
        }).catch((e: Error) => {if (mounted.current) setError(e.message);});
        return () => {mounted.current = false;};
    }, [refresh]);
    const activeId = active?.id;
    const activeStatus = active?.status;
    useEffect(() => {
        if (!activeId || !activeStatus || !['pending', 'running'].includes(activeStatus)) return;
        const id = activeId;
        let disposed = false;
        const poll = async () => {
            try {
                const row = await getSprout(id);
                if (!disposed) {setActive(current => current?.id === id ? row : current); setError(''); await refresh();}
            } catch (e) {if (!disposed) setError((e as Error).message);}
        };
        const timer = window.setInterval(() => void poll(), 2000);
        return () => {disposed = true; window.clearInterval(timer);};
    }, [activeId, activeStatus, refresh]);
    const select = (row: SproutRecord) => {sequence.current++; setActive(row); localStorage.setItem('memo-active-sprout', row.id);};
    const run = async (operation: () => Promise<SproutRecord>) => {
        const request = ++sequence.current;
        setBusy(true); setError('');
        try {
            const row = await operation();
            if (mounted.current && request === sequence.current) {setActive(row); localStorage.setItem('memo-active-sprout', row.id);}
            await refresh();
        } catch (e) {if (mounted.current && request === sequence.current) setError((e as Error).message);}
        finally {if (mounted.current) setBusy(false);}
    };
    return {records, active, options, error, busy, select, refresh,
        generate: (data: SproutInput) => run(() => createSprout(data)),
        retry: (data: Partial<SproutInput>) => active && run(() => regenerateSprout(active.id, data)),
        cancel: () => active && run(() => cancelSprout(active.id)),
        remove: async (id: string) => {try {await deleteSprout(id); if (active?.id === id) {sequence.current++; setActive(null); localStorage.removeItem('memo-active-sprout');} await refresh();} catch (e) {setError((e as Error).message);}},
    };
}
