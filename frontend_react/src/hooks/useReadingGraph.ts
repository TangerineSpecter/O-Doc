import {useEffect, useState} from 'react';
import {getReadingGraph, readingError} from '../api/bookAnalysis';
import type {GraphFilters, ReadingGraph} from '../types/bookAnalysis';

export function useReadingGraph(bookId: string, revisionId: string, filters: GraphFilters, refreshKey: string) {
    const [graph, setGraph] = useState<ReadingGraph>({nodes: [], edges: [], total: 0, page: 1, limit: 200});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const {view, chapterId, kind, query, center, order, page, thread} = filters;
    useEffect(() => {
        const controller = new AbortController();
        if (!revisionId) {setGraph({nodes: [], edges: [], total: 0, page: 1, limit: 200}); return;}
        setLoading(true); setError('');
        const timer = window.setTimeout(() => {
            getReadingGraph(bookId, {view, chapterId, kind, query, center, order, page, thread, revisionId}, controller.signal)
                .then(data => {if (!controller.signal.aborted) setGraph(data);})
                .catch(err => {if (!controller.signal.aborted) setError(readingError(err));})
                .finally(() => {if (!controller.signal.aborted) setLoading(false);});
        }, 180);
        return () => {clearTimeout(timer); controller.abort();};
    }, [bookId, revisionId, view, chapterId, kind, query, center, order, page, thread, refreshKey]);
    return {graph, loading, error};
}
