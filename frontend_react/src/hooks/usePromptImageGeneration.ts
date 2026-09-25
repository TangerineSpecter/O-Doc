import {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {generatePromptImage, getPromptGenerationResult} from '../api/prompt';
import type {PromptGenerationResponse} from '../types/api/prompt';
import {useToast} from '../components/common/ToastProvider';

type GenerationStatus = 'idle' | 'starting' | 'polling';
type PendingTask = {templateId: string; token: string};

const taskStorageKey = (templateId: string) => `odoc-prompt-generation-${templateId}`;

const getStoredTask = (templateId: string) => {
    try { return sessionStorage.getItem(taskStorageKey(templateId)); } catch { return null; }
};

const storeTask = (templateId: string, token: string | null) => {
    try {
        if (token) sessionStorage.setItem(taskStorageKey(templateId), token);
        else sessionStorage.removeItem(taskStorageKey(templateId));
    } catch { /* In private browsing, the current drawer can still finish the task. */ }
};

export function usePromptImageGeneration(templateId: string | null, onCompleted: () => void) {
    const toast = useToast();
    const [status, setStatus] = useState<GenerationStatus>('idle');
    const [pendingTask, setPendingTask] = useState<PendingTask | null>(null);
    const submittingIds = useRef(new Set<string>());
    const mountedRef = useRef(false);
    const templateIdRef = useRef(templateId);
    const onCompletedRef = useRef(onCompleted);
    const toastRef = useRef(toast);
    templateIdRef.current = templateId;
    onCompletedRef.current = onCompleted;
    toastRef.current = toast;

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!templateId) {
            setPendingTask(null);
            setStatus('idle');
            return;
        }
        if (submittingIds.current.has(templateId)) {
            setPendingTask(null);
            setStatus('starting');
            return;
        }
        const stored = getStoredTask(templateId);
        setPendingTask(stored ? {templateId, token: stored} : null);
        setStatus(stored ? 'polling' : 'idle');
    }, [templateId]);

    useEffect(() => {
        if (!pendingTask) return;
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        let transientFailures = 0;
        const controller = new AbortController();

        const poll = async () => {
            try {
                const result = await getPromptGenerationResult(pendingTask.templateId, pendingTask.token, controller.signal);
                if (!active || templateIdRef.current !== pendingTask.templateId) return;
                if (result.status === 'succeeded' && result.usage) {
                    storeTask(pendingTask.templateId, null);
                    setPendingTask(null);
                    setStatus('idle');
                    toastRef.current.success('生图完成，已保存到历史效果');
                    onCompletedRef.current();
                    return;
                }
                if (result.status !== 'pending') throw new Error('生图返回结果不完整');
                transientFailures = 0;
                timer = setTimeout(poll, 3000);
            } catch (error) {
                if (!active || controller.signal.aborted) return;
                const httpStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
                if (axios.isAxiosError(error) && (!httpStatus || httpStatus >= 500 || httpStatus === 429)) {
                    transientFailures += 1;
                    if (transientFailures === 3) toastRef.current.error('查询暂时失败，正在继续重试；生图任务不会重新提交');
                    timer = setTimeout(poll, Math.min(3000 * transientFailures, 30000));
                    return;
                }
                storeTask(pendingTask.templateId, null);
                setPendingTask(null);
                setStatus('idle');
                toastRef.current.error((error as Error).message || '查询生图结果失败');
            }
        };

        timer = setTimeout(poll, 3000);
        return () => {
            active = false;
            clearTimeout(timer);
            controller.abort();
        };
    }, [pendingTask]);

    const start = async (inputValues: Record<string, unknown>) => {
        if (!templateId || status !== 'idle' || submittingIds.current.has(templateId)) return;
        const currentId = templateId;
        submittingIds.current.add(currentId);
        setStatus('starting');
        try {
            const result: PromptGenerationResponse = await generatePromptImage(currentId, inputValues);
            if (result.status === 'succeeded' && result.usage) {
                if (!mountedRef.current) return;
                onCompletedRef.current();
                if (templateIdRef.current !== currentId) return;
                setStatus('idle');
                toastRef.current.success('生图完成，已保存到历史效果');
                return;
            }
            if (result.status !== 'pending' || !result.taskToken) throw new Error('生图任务返回不完整');
            storeTask(currentId, result.taskToken);
            if (!mountedRef.current || templateIdRef.current !== currentId) return;
            setPendingTask({templateId: currentId, token: result.taskToken});
            setStatus('polling');
        } catch (error) {
            if (!mountedRef.current || templateIdRef.current !== currentId) return;
            setStatus('idle');
            toastRef.current.error((error as Error).message || '提交生图失败');
        } finally {
            submittingIds.current.delete(currentId);
        }
    };

    return {status, start};
}
