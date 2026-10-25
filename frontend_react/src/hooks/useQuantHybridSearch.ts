import {useCallback, useEffect, useRef, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantSearchQuery, QuantSearchResult} from '../types/api/quantRetrieval';

type State = {key: string; loading: boolean; error: string; data?: QuantSearchResult};
export function useQuantHybridSearch(collection: string, query: QuantSearchQuery) {
    const key = JSON.stringify([collection, query]);
    const [state, setState] = useState<State>({key: '', loading: false, error: ''});
    const current = useRef<AbortController | null>(null);
    useEffect(() => () => {current.current?.abort();}, [key]);
    const cancel = useCallback(() => {current.current?.abort(); setState({key: '', loading: false, error: ''});}, []);
    const search = useCallback(async () => {
        current.current?.abort();
        const controller = new AbortController(); current.current = controller;
        setState({key, loading: true, error: ''});
        const [collectionId, params] = JSON.parse(key) as [string, QuantSearchQuery];
        try {
            const data = await quantApi.searchFactors(collectionId, params, controller.signal);
            if (!controller.signal.aborted) setState({key, data, loading: false, error: ''});
        } catch (error) {
            if (!controller.signal.aborted) setState({key, loading: false, error: error instanceof Error ? error.message : '检索失败，请重试'});
        }
    }, [key]);
    const active = state.key === key;
    return {active, loading: active && state.loading, error: active ? state.error : '', data: active ? state.data : undefined, search, cancel};
}
