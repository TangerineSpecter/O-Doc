import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import packageJson from '../../package.json';
import {useToast} from '@/components/common/ToastProvider';
import {getLatestVersionInfo, isNewerVersion, type LatestVersionInfo} from '@/api/versionInfo';

interface VersionInfoContextValue {
    currentVersion: string;
    latestVersion: LatestVersionInfo | null;
    isChecking: boolean;
    error: string;
    updateAvailable: boolean;
    refresh: (force?: boolean, signal?: AbortSignal) => Promise<void>;
}

const VersionInfoContext = createContext<VersionInfoContextValue | undefined>(undefined);
const CURRENT_VERSION = packageJson.version;

export const VersionInfoProvider = ({children}: {children: ReactNode}) => {
    const toast = useToast();
    const [latestVersion, setLatestVersion] = useState<LatestVersionInfo | null>(null);
    const [isChecking, setIsChecking] = useState(true);
    const [error, setError] = useState('');

    const refresh = useCallback(async (force = false, signal?: AbortSignal) => {
        setIsChecking(true);
        setError('');
        try {
            const latest = await getLatestVersionInfo(force, signal);
            if (signal?.aborted) return;
            setLatestVersion(latest);

            if (isNewerVersion(latest.version, CURRENT_VERSION)) {
                const noticeKey = `odoc:version-notified:${CURRENT_VERSION}:${latest.tagName}`;
                let shouldNotify = true;
                try {
                    shouldNotify = !window.localStorage.getItem(noticeKey);
                    if (shouldNotify) window.localStorage.setItem(noticeKey, '1');
                } catch {
                    // Keep the notice available when browser storage is disabled.
                }
                if (shouldNotify) {
                    toast.info(`发现新版本 ${latest.tagName}，当前运行 v${CURRENT_VERSION}。`);
                }
            }
        } catch {
            if (!signal?.aborted) setError('无法连接 GitHub 获取最新版本');
        } finally {
            if (!signal?.aborted) setIsChecking(false);
        }
    }, [toast]);

    useEffect(() => {
        const controller = new AbortController();
        void refresh(false, controller.signal);
        return () => controller.abort();
    }, [refresh]);

    const value = useMemo<VersionInfoContextValue>(() => ({
        currentVersion: CURRENT_VERSION,
        latestVersion,
        isChecking,
        error,
        updateAvailable: Boolean(latestVersion && isNewerVersion(latestVersion.version, CURRENT_VERSION)),
        refresh,
    }), [latestVersion, isChecking, error, refresh]);

    return <VersionInfoContext.Provider value={value}>{children}</VersionInfoContext.Provider>;
};

export const useVersionInfo = () => {
    const context = useContext(VersionInfoContext);
    if (!context) throw new Error('useVersionInfo must be used within a VersionInfoProvider');
    return context;
};
