import {useCallback, useEffect, useRef, useState} from 'react';
import {getWorldFinanceLedger} from '../api/agentWorld';
import type {WorldLedger} from '../types/api/agentWorld';

export function useAgentWorldFinance(agentId: string, enabled: boolean) {
    const [entries, setEntries] = useState<WorldLedger[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const requestId = useRef(0);
    const requestController = useRef<AbortController | null>(null);

    const reload = useCallback(async () => {
        if (!enabled) return;
        const currentRequest = ++requestId.current;
        requestController.current?.abort();
        const controller = new AbortController();
        requestController.current = controller;
        setLoading(true);
        setError('');
        try {
            const result = await getWorldFinanceLedger(agentId || undefined, controller.signal);
            if (currentRequest === requestId.current) setEntries(result || []);
        } catch (loadError) {
            if (!controller.signal.aborted && currentRequest === requestId.current) {
                setError(loadError instanceof Error ? loadError.message : '加载收支流水失败');
            }
        } finally {
            if (requestController.current === controller) requestController.current = null;
            if (currentRequest === requestId.current) setLoading(false);
        }
    }, [agentId, enabled]);

    useEffect(() => {
        if (!enabled) return;
        void reload();
        return () => {
            requestId.current += 1;
            requestController.current?.abort();
            requestController.current = null;
        };
    }, [enabled, reload]);

    return {entries, loading, error, reload};
}
