import {useCallback, useEffect, useRef, useState} from 'react';

type Entry<T> = {data?: T; error: boolean; loading: boolean};

/** Keep only matching query data visible; paging never invalidates other resources. */
export function usePerformanceResource<T>(key: string, fetcher: (signal: AbortSignal) => Promise<T>, enabled = true) {
    const [entries, setEntries] = useState(new Map<string, Entry<T>>());
    const [revision, setRevision] = useState(0);
    const active = useRef<AbortController | null>(null);
    const sequence = useRef(0);
    const store = useCallback((query: string, update: (old?: Entry<T>) => Entry<T>) => {
        setEntries(previous => {
            const next = new Map(previous);
            const value = update(next.get(query));
            next.delete(query); next.set(query, value);
            while (next.size > 8) next.delete(next.keys().next().value!);
            return next;
        });
    }, []);
    const perform = useCallback(() => {
        if (!enabled) return Promise.resolve();
        active.current?.abort();
        const controller = new AbortController(); active.current = controller;
        const current = ++sequence.current;
        let request: Promise<T>;
        try {request = fetcher(controller.signal);} catch {request = Promise.reject();}
        return request.then(data => {
            if (!controller.signal.aborted && current === sequence.current) store(key, () => ({data, error: false, loading: false}));
        }, () => {
            if (!controller.signal.aborted && current === sequence.current) store(key, old => ({data: old?.data, error: true, loading: false}));
        }).finally(() => {if (current === sequence.current) active.current = null;});
    }, [enabled, fetcher, key, store]);
    useEffect(() => {
        void perform();
        return () => active.current?.abort();
    }, [perform, revision]);
    const refresh = useCallback(async () => {
        if (!enabled || active.current !== null) return;
        store(key, old => ({data: old?.data, error: false, loading: true}));
        await perform();
    }, [enabled, key, perform, store]);
    const reset = useCallback(() => {
        active.current?.abort(); active.current = null; sequence.current++;
        setEntries(new Map()); setRevision(value => value + 1);
    }, []);
    const entry = enabled ? entries.get(key) : undefined;
    return {data: entry?.data, error: !!entry?.error, loading: enabled && (entry?.loading ?? entry === undefined), refresh, reset};
}
