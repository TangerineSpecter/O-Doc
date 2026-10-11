import {useCallback, useEffect, useState} from 'react';
import {getDecisionConfig} from '../api/decision';
import type {DecisionConfig} from '../types/api/decision';

export function useDecisionConfig() {
    const [config, setConfig] = useState<DecisionConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setConfig(await getDecisionConfig());
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '读取决策配置失败');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        getDecisionConfig(controller.signal).then(value => {
            if (!controller.signal.aborted) setConfig(value);
        }).catch(cause => {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '读取决策配置失败');
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, []);
    return {config, setConfig, loading, error, refresh};
}
