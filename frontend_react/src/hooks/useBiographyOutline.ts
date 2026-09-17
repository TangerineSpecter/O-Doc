import {useEffect, useState} from 'react';
import {getBiographyOutline, readingError} from '../api/bookAnalysis';
import type {BiographyOutline} from '../types/bookAnalysis';

export function useBiographyOutline(bookId: string, revisionId: string, throughChapter: number | undefined, refreshKey: string, enabled: boolean) {
    const [outline, setOutline] = useState<BiographyOutline | null>(null);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!enabled || !revisionId) {setOutline(null); setError(''); return;}
        const controller = new AbortController();
        setOutline(null);
        void getBiographyOutline(bookId, {revisionId, throughChapter}, controller.signal)
            .then(value => {if (!controller.signal.aborted) {setOutline(value); setError('');}})
            .catch(reason => {if (!controller.signal.aborted) setError(readingError(reason));});
        return () => controller.abort();
    }, [bookId, revisionId, throughChapter, refreshKey, enabled]);
    return {outline, error};
}
