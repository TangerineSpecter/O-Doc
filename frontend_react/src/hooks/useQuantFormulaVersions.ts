import {useCallback, useEffect, useRef, useState} from 'react';
import {quantApi} from '../api/quant';
import {createRequestKey} from '../utils/requestKey';
import type {QuantFormulaHistory} from '../types/api/quantFormulaVersion';

export function useQuantFormulaVersions(collection: string, candidateId: string, offset: number) {
    const [snapshot, setSnapshot] = useState<{key: string; data?: QuantFormulaHistory; error: string}>();
    const [busy, setBusy] = useState(false), [mutationError, setMutationError] = useState({key: '', message: ''});
    const [reload, setReload] = useState(0);
    const mutation = useRef({fingerprint: '', key: ''});
    const inspection = useRef<AbortController | null>(null);
    useEffect(() => () => inspection.current?.abort(), [collection, candidateId]);
    const queryKey = JSON.stringify([collection, candidateId, offset, reload]);
    const current = snapshot?.key === queryKey ? snapshot : undefined;
    const data = current?.data, loading = !current;
    const error = mutationError.key === queryKey && mutationError.message || current?.error || '';
    const setData = useCallback((value: QuantFormulaHistory) => setSnapshot({key: queryKey, data: value, error: ''}), [queryKey]);
    const setError = useCallback((message: string) => setMutationError({key: queryKey, message}), [queryKey]);
    useEffect(() => {
        const abort = new AbortController();
        void quantApi.formulaHistory(collection, candidateId, offset, abort.signal).then(value => {
            if (!abort.signal.aborted) setData(value);
        }).catch(cause => {if (!abort.signal.aborted) setSnapshot({key: queryKey, error: cause instanceof Error ? cause.message : '公式版本读取失败'});});
        return () => abort.abort();
    }, [collection, candidateId, offset, reload, queryKey, setData]);
    const keyFor = useCallback((fingerprint: string) => {
        if (mutation.current.fingerprint !== fingerprint) mutation.current = {fingerprint, key: createRequestKey()};
        return mutation.current.key;
    }, []);
    const save = useCallback(async (definitionJson: string, reason: string) => {
        setBusy(true); setError('');
        try {
            const key = keyFor(JSON.stringify([collection, candidateId, definitionJson, reason]));
            const result = await quantApi.editFormula(collection, candidateId, {definitionJson, reason, requestKey: key});
            setData(result.history); return result.candidate;
        } catch (cause) {setError(cause instanceof Error ? cause.message : '公式修订失败'); return undefined;}
        finally {setBusy(false);}
    }, [collection, candidateId, keyFor, setData, setError]);
    const select = async (id: string, reason: string) => {
        if (!data) return;
        setBusy(true); setError('');
        try {
            const key = keyFor(JSON.stringify([collection, id, data.currentSelectionId, reason]));
            const result = await quantApi.selectFormula(collection, id, key, data.currentSelectionId, reason);
            setData({...data, currentCandidateId: result.currentCandidateId, currentName: result.currentName, currentSelectionId: result.currentSelectionId,
                selections: result.selections, selectionsTotal: result.selectionsTotal});
        } catch (cause) {setError(cause instanceof Error ? cause.message : '当前研究版本选择失败，请刷新后重试');}
        finally {setBusy(false);}
    };
    const inspect = async (id: string) => {
        inspection.current?.abort();
        const controller = new AbortController(); inspection.current = controller;
        setBusy(true); setError('');
        try {const value = await quantApi.factor(collection, id, controller.signal); return controller.signal.aborted ? undefined : value;}
        catch (cause) {if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '公式版本读取失败'); return undefined;}
        finally {if (!controller.signal.aborted) setBusy(false);}
    };
    return {data, loading, busy, error, save, select, inspect, reload: () => setReload(value => value + 1)};
}
