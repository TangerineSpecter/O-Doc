import { useCallback, useEffect, useRef, useState } from 'react';
import { getSystemUpdateStatus, startSystemUpdate } from '@/api/setting';
import type { SystemUpdateState, SystemUpdateStatus } from '@/types/api/setting';
import {
    getLatestReleaseTag,
    isReleaseUpdateAvailable,
    type GitHubReleaseTag,
} from '@/utils/systemUpdate';

export const activeUpdateStates = new Set<SystemUpdateState>([
    'queued', 'pulling', 'verifyingImage', 'backingUp', 'restarting', 'healthCheck',
]);

export const useSystemUpdate = (isSuperuser: boolean) => {
    const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
    const [latestRelease, setLatestRelease] = useState<GitHubReleaseTag | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState('');
    const disconnectedAtRef = useRef<number | null>(null);

    const refresh = useCallback(async (force = false) => {
        setIsChecking(true);
        setError('');
        const [statusResult, releaseResult] = await Promise.allSettled([
            getSystemUpdateStatus(),
            getLatestReleaseTag(force),
        ]);
        if (statusResult.status === 'fulfilled') setStatus(statusResult.value);
        else setError('无法读取本机更新状态');
        if (releaseResult.status === 'fulfilled') setLatestRelease(releaseResult.value);
        else setError((current) => current || '无法连接 GitHub 检查最新版本');
        setIsChecking(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(timer);
    }, [refresh]);

    useEffect(() => {
        if (!status || !activeUpdateStates.has(status.state)) {
            disconnectedAtRef.current = null;
            return;
        }

        let cancelled = false;
        let timer: number | undefined;
        const poll = async () => {
            if (cancelled) return;
            try {
                const nextStatus = await getSystemUpdateStatus();
                if (!cancelled) {
                    disconnectedAtRef.current = null;
                    setStatus(nextStatus);
                    setError('');
                }
            } catch {
                if (!cancelled) {
                    if (disconnectedAtRef.current === null) disconnectedAtRef.current = Date.now();
                    if (Date.now() - disconnectedAtRef.current > 180_000) {
                        setError('等待服务恢复超时，请稍后点击“重新检查”；更新器仍可能在后台处理。');
                        return;
                    }
                    setError('服务正在重启，等待重新连接…');
                }
            } finally {
                const disconnectedTooLong = disconnectedAtRef.current !== null
                    && Date.now() - disconnectedAtRef.current > 180_000;
                if (!cancelled && !disconnectedTooLong) timer = window.setTimeout(poll, 3000);
            }
        };
        timer = window.setTimeout(poll, 3000);
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
    }, [status]);

    useEffect(() => {
        if (!status || status.state !== 'succeeded') return;
        if (status.currentVersion !== status.targetVersion) return;
        if (status.currentCommit.toLowerCase() !== status.targetCommit.toLowerCase()) return;
        const reloadKey = `odoc:update-reloaded:${status.targetCommit}`;
        if (window.sessionStorage.getItem(reloadKey)) return;
        window.sessionStorage.setItem(reloadKey, '1');
        const timer = window.setTimeout(() => window.location.reload(), 1200);
        return () => window.clearTimeout(timer);
    }, [status]);

    const updateAvailable = Boolean(status && isReleaseUpdateAvailable(
        status.currentVersion,
        status.currentCommit,
        latestRelease,
    ));
    const isUpdating = Boolean(status && activeUpdateStates.has(status.state));
    const canStart = Boolean(updateAvailable && status?.autoUpdateSupported && isSuperuser && !isUpdating);

    const start = useCallback(async () => {
        if (!latestRelease) return false;
        setIsStarting(true);
        setError('');
        try {
            const nextStatus = await startSystemUpdate({
                targetVersion: latestRelease.version,
                targetCommit: latestRelease.commit,
            });
            disconnectedAtRef.current = null;
            setStatus(nextStatus);
            return true;
        } catch (caughtError) {
            setError(caughtError instanceof Error ? caughtError.message : '提交更新任务失败');
            return false;
        } finally {
            setIsStarting(false);
        }
    }, [latestRelease]);

    return {
        status,
        latestRelease,
        isChecking,
        isStarting,
        error,
        updateAvailable,
        isUpdating,
        canStart,
        refresh,
        start,
    };
};
