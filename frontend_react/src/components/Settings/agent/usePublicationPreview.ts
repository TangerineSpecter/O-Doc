import {useEffect, useRef, useState} from 'react';
import {previewAgentPublication} from '@/api/agentPublish';
import type {PublishPreview} from '@/types/api/agentPublish';
export function usePublicationPreview(taskId: string) {
    const [result, setResult] = useState<PublishPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const pending = useRef<AbortController | null>(null);
    useEffect(() => () => pending.current?.abort(), []);
    const run = async (agentId: string) => {
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setResult(null); setError(''); setLoading(true);
        try {
            const value = await previewAgentPublication(taskId, agentId, controller.signal);
            if (!controller.signal.aborted) setResult(value);
        } catch (e) {
            if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '预览失败');
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    };
    const reset = () => {pending.current?.abort(); setResult(null); setLoading(false); setError('');};
    return {result, loading, error, run, reset};
}
