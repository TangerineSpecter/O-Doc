import {useEffect, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantFactorCandidate, QuantFactorGrouping} from '../types/api/quant';
export function useQuantOccurrences(collection: string, id: string, mode: QuantFactorGrouping, offset: number) {
    const [epoch, refresh] = useState(0);
    const key = JSON.stringify([collection, id, mode, offset, epoch]);
    const [result, setResult] = useState<{key: string; items: QuantFactorCandidate[]; total: number; error: string}>({key: '', items: [], total: 0, error: ''});
    useEffect(() => {
        const controller = new AbortController();
        const [coll, candidate, group, start] = JSON.parse(key) as [string, string, QuantFactorGrouping, number, number];
        void quantApi.factorOccurrences(coll, candidate, group, start, controller.signal).then(data => {
            if (!controller.signal.aborted) setResult({key, ...data, error: ''});
        }).catch((cause: unknown) => {if (!controller.signal.aborted) setResult({key, items: [], total: 0, error: cause instanceof Error ? cause.message : '来源加载失败'});});
        return () => controller.abort();
    }, [key]);
    return {loading: result.key !== key, ...result, retry: () => refresh(value => value + 1)};
}
