import {useEffect, useMemo, useRef, useState} from 'react';
import {getExecutionEvents, readingError} from '../api/bookAnalysis';
import type {ReadingExecutionEvent, ReadingRun} from '../types/bookAnalysis';
import {mergeExecutionEvents} from '../utils/readingExecution';

export function useExecutionFeed(bookId: string, run: ReadingRun) {
    const [older, setOlder] = useState<ReadingExecutionEvent[]>([]);
    const [hasMore, setHasMore] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const request = useRef<AbortController | null>(null);
    const events = useMemo(() => mergeExecutionEvents(older, run.events || []), [older, run.events]);
    useEffect(() => () => request.current?.abort(), [bookId, run.id]);
    const loadOlder = async () => {
        if (loading || !events.length) return;
        const controller = new AbortController();
        request.current?.abort(); request.current = controller;
        setLoading(true); setError('');
        try {
            const page = await getExecutionEvents(bookId, run.id, events[0].id, controller.signal);
            if (!controller.signal.aborted) {setOlder(current => mergeExecutionEvents(page.items, current)); setHasMore(page.hasMore);}
        } catch (err) {if (!controller.signal.aborted) setError(readingError(err));}
        finally {if (!controller.signal.aborted) setLoading(false);}
    };
    return {events, hasMore: hasMore ?? !!run.eventsTruncated, loading, error, loadOlder};
}
