import {useCallback, useEffect, useRef, useState} from 'react';
import {quantApi} from '../api/quant';
import type {QuantVerification} from '../types/api/quantVerification';
export function useQuantVerification(collection: string, candidate: string) {
    const [offset, setOffset] = useState(0), [epoch, setEpoch] = useState(0);
    const [result, setResult] = useState<{key: string; data?: QuantVerification; error: string}>({key: '', error: ''});
    const key = JSON.stringify([collection, candidate, offset, epoch]);
    const identity = JSON.stringify([collection, candidate]);
    const indexController = useRef<AbortController | null>(null);
    const [indexing, setIndexing] = useState({identity: '', busy: false, progress: '', error: ''});
    useEffect(() => () => indexController.current?.abort(), [identity]);
    const reload = useCallback(() => setEpoch(value => value + 1), []);
    useEffect(() => {
        const controller = new AbortController();
        const [coll, factor, start] = JSON.parse(key) as [string, string, number];
        void quantApi.factorVerification(coll, factor, start, controller.signal).then(data => {
            if (!controller.signal.aborted) setResult({key, data, error: ''});
        }).catch((error: unknown) => {if (!controller.signal.aborted) setResult({key, error: error instanceof Error ? error.message : '验证依据读取失败'});});
        return () => controller.abort();
    }, [key]);
    const stop = useCallback(() => {indexController.current?.abort(); setIndexing(state => ({...state, busy: false, progress: '已停止归集，已保存的依据保留'})); reload();}, [reload]);
    const index = useCallback(async () => {
        indexController.current?.abort();
        const controller = new AbortController(); indexController.current = controller;
        setIndexing({identity, busy: true, progress: '正在归集已有证据…', error: ''});
        try {
            for (const kind of ['experiment', 'comparison', 'feedback','fixed_validation','native_python'] as const) {
                let position = 0;
                do {
                    const value = await quantApi.indexVerification(collection, candidate, kind, position, controller.signal);
                    if (controller.signal.aborted) return;
                    setIndexing({identity, busy: true, error: '', progress: `正在归集${{experiment: '实验', comparison: '对照', feedback: '反馈',fixed_validation:'固定评价',native_python:'原始Python对照'}[kind]}：${value.nextOffset} / ${value.total}`});
                    if (!value.hasMore) break;
                    if (value.nextOffset <= position) throw new Error('归集分页没有推进，请重试');
                    position = value.nextOffset;
                } while (!controller.signal.aborted);
            }
            if (!controller.signal.aborted) {setIndexing({identity, busy: false, progress: '已有证据已归集；原始报告、实验及评分保持可追溯', error: ''}); reload();}
        } catch (error) {if (!controller.signal.aborted) setIndexing({identity, busy: false, progress: '', error: error instanceof Error ? error.message : '归集失败，请重试'});}
    }, [collection, candidate, identity, reload]);
    return {data: result.key === key ? result.data : undefined, loading: result.key !== key, error: result.key === key ? result.error : '',
        reload, offset, setOffset, index, stop, indexing: indexing.identity === identity ? indexing : {busy: false, progress: '', error: ''}};
}
