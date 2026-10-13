import {useEffect, useRef, useState} from 'react';
import {cancelBattleAppearanceImageTask, getBattleAppearanceImageTask, recoverBattleAppearanceImageTask} from '@/api/setting';
import type {BattleAppearanceImageTask} from '@/api/setting';

export const ACTIVE_HEAD_TASKS = new Set(['submitting', 'generating', 'download_pending']);
type Props = {
    agentId: string;
    task: BattleAppearanceImageTask | null;
    onResult: (task: BattleAppearanceImageTask, isCurrent?: () => boolean) => Promise<void>;
};

export function useBattleHeadTask({agentId, task, onResult}: Props) {
    const [now, setNow] = useState(Date.now);
    const [cancelling, setCancelling] = useState(false);
    const [recovering, setRecovering] = useState(false);
    const [query, setQuery] = useState<{key: string; error: string; checkedAt: number | null}>({key: '', error: '', checkedAt: null});
    const revision = useRef(0);
    const cancellationLock = useRef(false);
    const recoveryLock = useRef(false);
    const taskId = task?.taskId;
    const key = `${agentId}/${taskId || ''}`;
    const queryError = query.key === key ? query.error : '';
    const lastCheckedAt = query.key === key ? query.checkedAt : null;
    const status = task?.status;
    const active = ACTIVE_HEAD_TASKS.has(status || '');
    const createdAt = task?.createdAt;
    const waitLimit = task?.waitLimitSeconds || 900;
    const elapsedSeconds = createdAt
        ? Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000))
        : task?.elapsedSeconds || 0;

    useEffect(() => () => { revision.current++; }, [agentId, taskId]);

    useEffect(() => {
        if (!active) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [active, taskId]);

    useEffect(() => {
        if (!taskId || !active || cancelling) return;
        const version = ++revision.current;
        let alive = true;
        let timer: ReturnType<typeof setTimeout>;
        const isCurrent = () => alive && revision.current === version;
        const poll = async () => {
            try {
                const result = await getBattleAppearanceImageTask(agentId, taskId);
                if (!isCurrent()) return;
                if (Array.isArray(result)) throw new Error('未能取得当前任务状态');
                setQuery({key, error: '', checkedAt: Date.now()});
                await onResult(result, isCurrent);
                if (isCurrent() && ACTIVE_HEAD_TASKS.has(result.status)) {
                    timer = setTimeout(poll, Math.max(3000, (result.retryAfterSeconds || 5) * 1000));
                }
            } catch (error) {
                if (!isCurrent()) return;
                setQuery(previous => ({key, error: error instanceof Error ? error.message : '网络查询失败', checkedAt: previous.key === key ? previous.checkedAt : null}));
                timer = setTimeout(poll, 8000);
            }
        };
        timer = setTimeout(poll, 2500);
        return () => { alive = false; clearTimeout(timer); };
    }, [agentId, taskId, key, status, active, cancelling, onResult]);

    useEffect(() => {
        if (!task || !active || cancelling || elapsedSeconds < waitLimit) return;
        // Stop the local polling timer even when the server cannot be reached.
        // The API independently expires the persisted task before the next query/submission.
        revision.current++;
        void onResult({...task, status: 'timed_out', message: '已达到 15 分钟等待上限，自动停止等待；可重新生成'});
    }, [task, active, cancelling, elapsedSeconds, waitLimit, onResult]);

    const cancel = async () => {
        if (!taskId || !active || cancellationLock.current) return;
        cancellationLock.current = true;
        const version = ++revision.current;
        setCancelling(true);
        try {
            const result = await cancelBattleAppearanceImageTask(agentId, taskId);
            if (revision.current !== version) return;
            await onResult(result, () => revision.current === version);
            setQuery(previous => ({key, error: '', checkedAt: previous.key === key ? previous.checkedAt : null}));
        } catch (error) {
            setQuery(previous => ({key, error: `取消未成功：${error instanceof Error ? error.message : '无法连接服务器'}，请重试。`, checkedAt: previous.key === key ? previous.checkedAt : null}));
        } finally {
            cancellationLock.current = false;
            setCancelling(false);
        }
    };
    const recover = async () => {
        if (!taskId || status !== 'timed_out' || recoveryLock.current) return;
        recoveryLock.current = true;
        const version = ++revision.current;
        setRecovering(true);
        try {
            const result = await recoverBattleAppearanceImageTask(agentId, taskId);
            await onResult(result, () => revision.current === version);
            setQuery({key, error: result.status === 'timed_out' ? '服务商仍在处理，可稍后再次查询原任务。' : '', checkedAt: Date.now()});
        } catch (error) {
            setQuery({key, error: error instanceof Error ? error.message : '原任务查询失败', checkedAt: null});
        } finally {
            recoveryLock.current = false;
            setRecovering(false);
        }
    };
    return {active, cancelling, recovering, isRecovering: () => recoveryLock.current, cancel, recover, elapsedSeconds, waitLimit, queryError, lastCheckedAt};
}
