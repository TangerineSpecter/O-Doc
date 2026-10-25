import {useCallback, useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantFactorCandidate, QuantFactorQuery} from '../types/api/quant';

type Result = {key: string; items: QuantFactorCandidate[]; total: number; error: string};
export function useQuantFactors(collection: string, query: QuantFactorQuery, enabled = true) {
    const [result, setResult] = useState<Result>({key: '', items: [], total: 0, error: ''});
    const [epoch, setEpoch] = useState(0);
    const reload = useCallback(() => setEpoch(value => value + 1), []);
    const key = JSON.stringify([collection, query, epoch]);
    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        const [collectionId, parameters] = JSON.parse(key) as [string, QuantFactorQuery, number];
        const timer = setTimeout(() => {
            void quantApi.factors(collectionId, parameters, controller.signal).then(data => {
                if (!controller.signal.aborted) setResult({key, ...data, error: ''});
            }).catch((cause: unknown) => {
                if (!controller.signal.aborted) setResult({key, items: [], total: 0, error: cause instanceof Error ? cause.message : '候选库加载失败，请重试'});
            });
        }, 180);
        return () => {clearTimeout(timer); controller.abort();};
    }, [key, enabled]);
    const loading = result.key !== key;
    return {items: loading ? [] : result.items, total: loading ? 0 : result.total, loading, error: loading ? '' : result.error, reload};
}
