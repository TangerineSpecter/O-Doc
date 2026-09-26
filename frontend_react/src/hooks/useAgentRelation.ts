import {useCallback, useEffect, useState} from 'react';
import {getAgentRelations} from '../api/setting';
import type {AgentRelationEdge, AgentRelationGraph} from '../types/api/setting';

export function useAgentRelation(enabled: boolean) {
    const [graph, setGraph] = useState<AgentRelationGraph | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedEdge, setSelectedEdge] = useState<AgentRelationEdge | null>(null);

    const reload = useCallback((signal?: AbortSignal) => {
        setLoading(true);
        setError('');
        return getAgentRelations(signal)
            .then(data => {
                if (signal?.aborted) return;
                setGraph(data);
            })
            .catch((reason: unknown) => {
                if (signal?.aborted) return;
                setError(reason instanceof Error ? reason.message : '关系图谱加载失败');
            })
            .finally(() => {
                if (!signal?.aborted) setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (!enabled) return undefined;
        const controller = new AbortController();
        void reload(controller.signal);
        return () => controller.abort();
    }, [enabled, reload]);

    return {graph, loading, error, selectedEdge, setSelectedEdge, reload: () => reload()};
}
