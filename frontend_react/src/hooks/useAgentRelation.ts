import {useCallback, useEffect, useRef, useState} from 'react';
import {getAgentRelations} from '../api/setting';
import type {AgentRelationEdge, AgentRelationGraph} from '../types/api/setting';

export function useAgentRelation(enabled: boolean, includeDeparted = false) {
    const [graph, setGraph] = useState<AgentRelationGraph | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedEdge, setSelectedEdge] = useState<AgentRelationEdge | null>(null);
    const activeRequest = useRef<AbortController | null>(null);
    const requestId = useRef(0);

    const reload = useCallback((quiet = false) => {
        activeRequest.current?.abort();
        const controller = new AbortController();
        activeRequest.current = controller;
        const id = ++requestId.current;
        if (!quiet) {
            setLoading(true);
            setError('');
        }
        return getAgentRelations(controller.signal, includeDeparted)
            .then(data => {
                if (controller.signal.aborted || id !== requestId.current) return;
                setGraph(data);
                setError('');
            })
            .catch((reason: unknown) => {
                if (controller.signal.aborted || id !== requestId.current) return;
                if (!quiet) setError(reason instanceof Error ? reason.message : '关系图谱加载失败');
            })
            .finally(() => {
                if (!controller.signal.aborted && id === requestId.current) {
                    activeRequest.current = null;
                    setLoading(false);
                }
            });
    }, [includeDeparted]);

    useEffect(() => {
        if (!enabled) return undefined;
        void reload();
        const timer = window.setInterval(() => {
            if (!document.hidden && !activeRequest.current) void reload(true);
        }, 5000);
        return () => {
            window.clearInterval(timer);
            requestId.current += 1;
            activeRequest.current?.abort();
            activeRequest.current = null;
        };
    }, [enabled, reload]);

    return {graph, loading, error, selectedEdge, setSelectedEdge, reload: () => reload()};
}
