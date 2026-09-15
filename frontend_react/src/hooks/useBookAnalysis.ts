import {useCallback, useEffect, useRef, useState} from 'react';
import {getBookAnalysis, readingError} from '../api/bookAnalysis';
import type {BookAnalysisStatus} from '../types/bookAnalysis';

export function useBookAnalysis(bookId: string, revisionId = '') {
    const [status, setStatus] = useState<BookAnalysisStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const sequence = useRef(0);
    const scope = useRef(0);
    const controller = useRef<AbortController | null>(null);
    const load = useCallback(async () => {
        const seq = ++sequence.current;
        controller.current?.abort();
        const pending = new AbortController();
        controller.current = pending;
        try {
            const data = await getBookAnalysis(bookId, pending.signal, revisionId);
            if (sequence.current === seq) {setStatus(data); setError('');}
        } catch (err) {
            if (!pending.signal.aborted && sequence.current === seq) setError(readingError(err));
        } finally {
            if (sequence.current === seq) setLoading(false);
        }
    }, [bookId, revisionId]);
    useEffect(() => {
        setLoading(true); setStatus(null); setBusy(false);
        void load();
        return () => {++scope.current; ++sequence.current; controller.current?.abort();};
    }, [load]);
    const running = status?.run?.state === 'queued' || status?.run?.state === 'running';
    useEffect(() => {
        if (!running) return;
        const interval = window.setInterval(() => void load(), 3000);
        return () => clearInterval(interval);
    }, [running, load]);
    const perform = useCallback(async (operation: () => Promise<unknown>) => {
        const epoch = scope.current;
        setBusy(true); setError('');
        try {await operation(); if (scope.current === epoch) await load();}
        catch (err) {if (scope.current === epoch) setError(readingError(err));}
        finally {if (scope.current === epoch) setBusy(false);}
    }, [load]);
    return {status, loading, busy, running, error, reload: load, perform};
}
