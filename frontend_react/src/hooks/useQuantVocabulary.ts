import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantVocabulary} from '../types/api/quantVocabulary';

export function useQuantVocabulary(collection: string, selectedRevisionId = '', offset = 0) {
    const [epoch, setEpoch] = useState(0);
    const [result, setResult] = useState<{key: string; data?: QuantVocabulary; error: string}>({key: '', error: ''});
    const key = JSON.stringify([collection, selectedRevisionId, offset, epoch]);
    const reload = useCallback(() => setEpoch(value => value + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        const [coll, revision, start] = JSON.parse(key) as [string, string, number];
        void quantApi.vocabulary(coll, revision, start, controller.signal).then(data => {
            if (!controller.signal.aborted) setResult({key, data, error: ''});
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setResult({key, error: error instanceof Error ? error.message : '分类词表加载失败'});
        });
        return () => controller.abort();
    }, [key]);
    return {data: result.key === key ? result.data : undefined, loading: result.key !== key,
        error: result.key === key ? result.error : '', reload};
}
