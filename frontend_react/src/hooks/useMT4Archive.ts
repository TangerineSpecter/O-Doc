import {useCallback, useEffect, useState} from 'react';
import {mt4Api} from '../api/mt4Archive';
import type {MT4Expert, MT4ExpertDetail, MT4TestDetail} from '../types/api/mt4Archive';

export function useMT4Archive(collection: string) {
    const [experts, setExperts] = useState<MT4Expert[]>([]);
    const [detail, setDetail] = useState<MT4ExpertDetail | null>(null);
    const [test, setTest] = useState<MT4TestDetail | null>(null);
    const [loadedCollection, setLoadedCollection] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {setExperts(await mt4Api.experts(collection));}, [collection]);
    useEffect(() => {let active = true; mt4Api.experts(collection).then(rows => {if (active) setExperts(rows);}).catch(e => {if (active) setError(e instanceof Error ? e.message : '加载失败');}).finally(() => {if (active) setLoadedCollection(collection);}); return () => {active = false;};}, [collection]);
    const run = async (action: () => Promise<void>) => {setBusy(true); setError(''); try {await action();} catch (e) {setError(e instanceof Error ? e.message : '操作失败');} finally {setBusy(false);}};
    const openExpert = async (id: string) => {setDetail(await mt4Api.expert(collection, id)); setTest(null);};
    const openTest = async (id: string) => {if (detail) setTest(await mt4Api.test(collection, detail.expert.id, id));};
    const refreshDetail = async () => {if (detail) setDetail(await mt4Api.expert(collection, detail.expert.id));};
    const refreshTest = async () => {if (detail && test) setTest(await mt4Api.test(collection, detail.expert.id, test.backtest.id));};
    return {experts, detail, test, loading: loadedCollection !== collection, busy, error, run, reload, openExpert, openTest, refreshDetail, refreshTest, setDetail, setTest};
}
