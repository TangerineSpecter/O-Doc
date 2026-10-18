import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Github, Info, Leaf, RefreshCw, UserRound } from 'lucide-react';
import { getRuntimeInfo } from '@/api/setting';
import {
    getCurrentBuildInfo,
    getLatestVersionInfo,
    shortCommit,
    type CurrentBuildInfo,
    type LatestVersionInfo,
} from '@/api/versionInfo';

const GITHUB_URL = 'https://github.com/TangerineSpecter/O-Doc';
const formatUptime = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const days = Math.floor(safeSeconds / 86400);
    const hours = Math.floor((safeSeconds % 86400) / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分钟`;
    if (hours > 0) return `${hours} 小时 ${minutes} 分钟 ${seconds} 秒`;
    if (minutes > 0) return `${minutes} 分钟 ${seconds} 秒`;
    return `${seconds} 秒`;
};

export const AboutSettings = () => {
    const fallbackMeasuredAt = useMemo(() => Date.now(), []);
    const [runtimeMeasuredAt, setRuntimeMeasuredAt] = useState<number>(fallbackMeasuredAt);
    const [baseUptimeSeconds, setBaseUptimeSeconds] = useState(0);
    const [uptimeSeconds, setUptimeSeconds] = useState(0);
    const [runtimeSource, setRuntimeSource] = useState<'server' | 'browser'>('browser');
    const [currentBuild, setCurrentBuild] = useState<CurrentBuildInfo | null>(null);
    const [latestVersion, setLatestVersion] = useState<LatestVersionInfo | null>(null);
    const [isCheckingVersions, setIsCheckingVersions] = useState(true);
    const [versionError, setVersionError] = useState('');

    const refreshVersions = useCallback(async (force = false, signal?: AbortSignal) => {
        setIsCheckingVersions(true);
        setVersionError('');
        const [currentResult, latestResult] = await Promise.allSettled([
            getCurrentBuildInfo(signal),
            getLatestVersionInfo(force, signal),
        ]);
        if (signal?.aborted) return;

        const errors: string[] = [];
        if (currentResult.status === 'fulfilled') setCurrentBuild(currentResult.value);
        else errors.push('当前版本读取失败');
        if (latestResult.status === 'fulfilled') setLatestVersion(latestResult.value);
        else errors.push('无法连接 GitHub 获取最新版本');
        setVersionError(errors.join('；'));
        setIsCheckingVersions(false);
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void refreshVersions(false, controller.signal);
        return () => controller.abort();
    }, [refreshVersions]);

    useEffect(() => {
        let cancelled = false;
        getRuntimeInfo()
            .then((runtimeInfo) => {
                if (cancelled) return;
                setRuntimeMeasuredAt(Date.now());
                setBaseUptimeSeconds(runtimeInfo.uptimeSeconds);
                setUptimeSeconds(runtimeInfo.uptimeSeconds);
                setRuntimeSource('server');
            })
            .catch(() => {
                if (!cancelled) setRuntimeSource('browser');
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setUptimeSeconds(baseUptimeSeconds + Math.floor((Date.now() - runtimeMeasuredAt) / 1000));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [baseUptimeSeconds, runtimeMeasuredAt]);

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm overflow-hidden relative">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-50" />
                <div className="absolute right-10 top-10 h-10 w-10 rounded-full bg-lime-50" />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 ring-1 ring-orange-100"><Leaf className="h-7 w-7" /></div>
                        <div>
                            <p className="text-xs font-semibold text-orange-600">About O-Doc</p>
                            <h3 className="mt-1 text-xl font-bold text-slate-900">小橘文档</h3>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">清爽轻量的个人知识空间，把写作、阅读沉淀、闪念与 AI 辅助能力收纳在一起。</p>
                        </div>
                    </div>
                    <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800">
                        <Github className="h-4 w-4" /> GitHub <ExternalLink className="h-3.5 w-3.5 text-white/70" />
                    </a>
                </div>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h4 className="font-bold text-slate-800">版本信息</h4>
                        <p className="mt-1 text-xs text-slate-500">查看当前运行版本和 GitHub 最新稳定版本</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void refreshVersions(true)}
                        disabled={isCheckingVersions}
                        aria-label="刷新版本信息"
                        title="刷新版本信息"
                        className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${isCheckingVersions ? 'animate-spin' : ''}`} />
                        刷新
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <VersionMetric
                        label="当前版本"
                        value={currentBuild?.version && currentBuild.version !== 'unknown' ? `v${currentBuild.version}` : '—'}
                        detail={currentBuild ? `构建 ${shortCommit(currentBuild.commit)}` : '本机应用构建'}
                    />
                    <VersionMetric
                        label="最新版本"
                        value={latestVersion?.tagName || '—'}
                        detail={latestVersion
                            ? `GitHub Tags · ${new Date(latestVersion.checkedAt).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'})}`
                            : 'GitHub 最新稳定标签'}
                    />
                </div>
                {versionError && <p className="mt-3 text-xs text-amber-700">{versionError}</p>}
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-orange-50 p-2 text-orange-600"><UserRound className="h-5 w-5" /></div><div><p className="text-xs text-slate-500">作者</p><h4 className="font-bold text-slate-800">丢失的橘子</h4></div></div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Info className="h-5 w-5" /></div><div><p className="text-xs text-slate-500">{runtimeSource === 'server' ? '累计运行时间' : '运行时间加载中'}</p><h4 className="font-bold text-slate-800">{formatUptime(uptimeSeconds)}</h4></div></div></div>
            </div>

        </div>
    );
};

const VersionMetric = ({label, value, detail}: {label: string; value: string; detail: string}) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 truncate font-mono text-base font-bold text-slate-800">{value}</p>
        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{detail}</p>
    </div>
);
