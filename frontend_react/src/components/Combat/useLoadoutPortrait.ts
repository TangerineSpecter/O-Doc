import {useCallback, useEffect, useRef, useState} from 'react';
import {downloadResource} from '@/api/resources';
import {applyLoadoutPortrait, cancelPortraitTask, clearLoadoutPortrait, generatePortrait, getLoadoutPortrait, getPortraitTasks, queryPortraitTask} from '@/api/loadoutPortrait';
import type {PortraitTask, SavedPortrait} from '@/api/loadoutPortrait';

const activeStatuses = new Set(['submitting', 'generating', 'download_pending']);
export function usePortraitImage(assetId?: string) {
    const [image, setImage] = useState({id: '', url: ''});
    const [failure, setFailure] = useState({id: '', message: ''});
    useEffect(() => {
        let alive = true;
        let url = '';
        if (assetId) void downloadResource(assetId).then(blob => {
            if (!alive) return;
            url = URL.createObjectURL(blob);
            setImage({id: assetId, url});
        }).catch(() => {if (alive) setFailure({id: assetId, message: '立绘图片加载失败，请重新打开重试'});});
        return () => {alive = false; if (url) URL.revokeObjectURL(url);};
    }, [assetId]);
    return {url: image.id === assetId ? image.url : '', error: failure.id === assetId ? failure.message : ''};
}

/** Mounted with an actor key: switching residents cannot install another resident's response. */
export function useLoadoutPortrait(agentId: string) {
    const [saved, setSaved] = useState<SavedPortrait>({imageUrl: '', assetId: '', scale: 1});
    const [task, setTask] = useState<PortraitTask | null>(null);
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const alive = useRef(true);
    const lock = useRef(false);
    useEffect(() => {
        alive.current = true;
        let cancelled = false;
        void Promise.allSettled([getLoadoutPortrait(agentId), getPortraitTasks(agentId)]).then(([portrait, tasks]) => {
            if (cancelled) return;
            if (portrait.status === 'fulfilled') setSaved(portrait.value);
            if (tasks.status === 'fulfilled') setTask(tasks.value.find(item => activeStatuses.has(item.status)) || tasks.value[0] || null);
            const failure = [portrait, tasks].find(result => result.status === 'rejected');
            if (failure?.status === 'rejected') setError(failure.reason instanceof Error ? failure.reason.message : '立绘加载失败，请重新打开');
        })
            .finally(() => {if (!cancelled) setLoading(false);});
        return () => {cancelled = true; alive.current = false;};
    }, [agentId]);
    const taskId = task?.taskId;
    const active = activeStatuses.has(task?.status || '');
    useEffect(() => {
        if (!taskId || !active) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        const poll = async () => {
            try {
                const result = await queryPortraitTask(agentId, taskId);
                if (cancelled) return;
                setTask(result); setError('');
                if (activeStatuses.has(result.status)) timer = setTimeout(poll, 5000);
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : '查询失败，将自动重试');
                timer = setTimeout(poll, 8000);
            }
        };
        timer = setTimeout(poll, 3000);
        return () => {cancelled = true; clearTimeout(timer);};
    }, [agentId, taskId, active]); // status changes do not restart a running poll

    const perform = useCallback(async (operation: () => Promise<void>) => {
        if (lock.current) return;
        lock.current = true; setBusy(true); setError('');
        try {await operation();} catch (err) {if (alive.current) setError(err instanceof Error ? err.message : '操作失败，请重试');}
        finally {lock.current = false; if (alive.current) setBusy(false);}
    }, []);
    return {saved, task, busy, loading, active, error,
        generate: (data: Parameters<typeof generatePortrait>[1]) => perform(async () => {const result = await generatePortrait(agentId, data); if (alive.current) setTask(result);}),
        apply: (scale: number) => perform(async () => {if (!task || task.status !== 'succeeded') return; const result = await applyLoadoutPortrait(agentId, {taskId: task.taskId, scale}); if (alive.current) setSaved(result);}),
        saveScale: (scale: number) => perform(async () => {const result = await applyLoadoutPortrait(agentId, {scale}); if (alive.current) setSaved(result);}),
        clear: () => perform(async () => {const result = await clearLoadoutPortrait(agentId); if (alive.current) setSaved(result);}),
        cancel: () => perform(async () => {if (!task) return; const result = await cancelPortraitTask(agentId, task.taskId); if (alive.current) setTask(result);}),
    };
}
