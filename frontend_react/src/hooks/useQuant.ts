import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getAnthologyDetail } from '../api/anthology';
import { quantApi } from '../api/quant';
import type { QuantEntry, QuantEntryDetail, QuantModels } from '../types/api/quant';
import { quantError } from '../utils/quant';

export function useQuant(collection: string, entryId: string) {
    const [title, setTitle] = useState('');
    const [entries, setEntries] = useState<QuantEntry[]>([]);
    const [languageFilter, setLanguageFilter] = useState('');
    const [detail, setDetail] = useState<QuantEntryDetail | null>(null);
    const [models, setModels] = useState<QuantModels>({ models: [], defaultModelId: '' });
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(!!entryId);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const generation = useRef(0);
    const target = useRef({ collection, entryId });
    useLayoutEffect(() => {
        target.current = { collection, entryId };
    }, [collection, entryId]);
    const refresh = useCallback(async () => {
        const at = { collection, entryId };
        const [list, current] = await Promise.all([
            quantApi.entries(collection, undefined, languageFilter),
            entryId ? quantApi.detail(collection, entryId) : Promise.resolve(null),
        ]);
        if (target.current.collection !== at.collection || target.current.entryId !== at.entryId) return;
        setEntries(list);
        setDetail(current);
    }, [collection, entryId, languageFilter]);
    useEffect(() => {
        const controller = new AbortController();
        const current = ++generation.current;
        // Reset the state of the external request when its collection/filter changes.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);
        setError('');
        setEntries([]);
        void Promise.all([
            quantApi.entries(collection, controller.signal, languageFilter),
            quantApi.models(controller.signal),
            getAnthologyDetail(collection),
        ])
            .then(([list, modelOptions, anthology]) => {
                if (current === generation.current) {
                    setEntries(list);
                    setModels(modelOptions);
                    setTitle(anthology.title);
                }
            })
            .catch((error) => {
                if (!controller.signal.aborted) setError(quantError(error));
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [collection, languageFilter]);
    useEffect(() => {
        const controller = new AbortController();
        // Reset the state owned by the selected entry request before fetching it.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDetail(null);
        setDetailLoading(!!entryId);
        setError('');
        if (entryId)
            void quantApi
                .detail(collection, entryId, controller.signal)
                .then((result) => {
                    if (!controller.signal.aborted) setDetail(result);
                })
                .catch((error) => {
                    if (!controller.signal.aborted) setError(quantError(error));
                })
                .finally(() => {
                    if (!controller.signal.aborted) setDetailLoading(false);
                });
        return () => controller.abort();
    }, [collection, entryId]);
    const safe = useCallback(
        async (operation: () => Promise<unknown>, reload = true): Promise<boolean> => {
            if (busyRef.current) return false;
            busyRef.current = true;
            setBusy(true);
            setError('');
            try {
                await operation();
                if (reload) await refresh();
                return true;
            } catch (error) {
                setError(quantError(error));
                return false;
            } finally {
                busyRef.current = false;
                setBusy(false);
            }
        },
        [refresh],
    );
    const reload = useCallback(async () => {
        await refresh();
        const [modelOptions, anthology] = await Promise.all([
            quantApi.models(),
            getAnthologyDetail(collection),
        ]);
        if (target.current.collection === collection) {
            setModels(modelOptions);
            setTitle(anthology.title);
        }
    }, [collection, refresh]);
    const running = detail?.runs.some((run) => run.status === 'running' || run.status === 'pending') || false;
    useEffect(() => {
        if (!entryId || !running) return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const runs = await quantApi.runs(collection, entryId, controller.signal);
                if (!controller.signal.aborted) {
                    setDetail((current) => (current?.id === entryId ? { ...current, runs } : current));
                    setError((current) => (current.startsWith('AI 任务状态更新失败：') ? '' : current));
                }
            } catch (error) {
                if (!controller.signal.aborted) setError(`AI 任务状态更新失败：${quantError(error)}`);
            }
            if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 1800);
        };
        timer = setTimeout(() => void poll(), 1200);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [collection, entryId, running]);
    return {
        title,
        entries,
        detail,
        models,
        loading,
        detailLoading,
        busy,
        error,
        safe,
        refresh,
        reload,
        setError,
        languageFilter,
        setLanguageFilter,
        removeLocal: (id: string) => setEntries((current) => current.filter((entry) => entry.id !== id)),
    };
}
export type QuantController = ReturnType<typeof useQuant>;
