import { useEffect, useMemo, useState } from 'react';
import {
    ArrowUpCircle,
    CheckCircle2,
    DatabaseBackup,
    ExternalLink,
    Github,
    Info,
    Leaf,
    Loader2,
    RefreshCw,
    RotateCcw,
    Server,
    ShieldCheck,
    UserRound,
    WifiOff,
} from 'lucide-react';
import { getRuntimeInfo } from '@/api/setting';
import ConfirmationModal from '@/components/common/ConfirmationModal';
import { useAuth } from '@/contexts/AuthContext';
import { useSystemUpdate } from '@/hooks/useSystemUpdate';
import type { SystemUpdateState } from '@/types/api/setting';
import { shortCommit } from '@/utils/systemUpdate';

const GITHUB_URL = 'https://github.com/TangerineSpecter/O-Doc';
const stateLabels: Record<SystemUpdateState, string> = {
    idle: '等待更新',
    queued: '已进入更新队列',
    pulling: '拉取镜像',
    verifyingImage: '核对构建',
    backingUp: '备份数据库',
    restarting: '重启服务',
    healthCheck: '健康检查',
    succeeded: '更新完成',
    rolledBack: '已自动回退',
    failed: '更新失败',
};

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
    const { userInfo } = useAuth();
    const fallbackMeasuredAt = useMemo(() => Date.now(), []);
    const [runtimeMeasuredAt, setRuntimeMeasuredAt] = useState<number>(fallbackMeasuredAt);
    const [baseUptimeSeconds, setBaseUptimeSeconds] = useState(0);
    const [uptimeSeconds, setUptimeSeconds] = useState(0);
    const [runtimeSource, setRuntimeSource] = useState<'server' | 'browser'>('browser');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const isSuperuser = Boolean(userInfo?.isSuperuser);
    const {
        status: updateStatus,
        latestRelease,
        isChecking,
        isStarting,
        error: updateError,
        updateAvailable,
        isUpdating,
        canStart: canStartUpdate,
        refresh: refreshUpdateInfo,
        start: startUpdate,
    } = useSystemUpdate(isSuperuser);

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

    const handleStartUpdate = async () => {
        if (await startUpdate()) setConfirmOpen(false);
    };

    const statusTone = updateStatus?.state === 'succeeded'
        ? 'border-lime-200 bg-lime-50/70 text-lime-800'
        : updateStatus?.state === 'failed' || updateStatus?.state === 'rolledBack'
            ? 'border-red-200 bg-red-50/70 text-red-800'
            : 'border-orange-200 bg-orange-50/70 text-orange-900';

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

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_right,_rgba(249,115,22,0.12),_transparent_38%),linear-gradient(135deg,#fff_0%,#fffaf4_100%)] p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-slate-900 p-3 text-white shadow-lg shadow-slate-200"><ArrowUpCircle className="h-6 w-6" /></div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-slate-900">系统更新</h3>{updateAvailable && <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-bold text-orange-700">发现新构建</span>}</div>
                                <p className="mt-1 text-sm leading-6 text-slate-500">更新前自动备份数据库；服务重启后页面会自行重新连接。</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => void refreshUpdateInfo(true)} disabled={isChecking || isUpdating} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} />重新检查</button>
                            {isSuperuser && <button type="button" onClick={() => setConfirmOpen(true)} disabled={!canStartUpdate} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-200 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">{isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}{isUpdating ? '更新中' : '立即更新'}</button>}
                        </div>
                    </div>
                    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <VersionMetric label="当前版本" value={`v${updateStatus?.currentVersion || '—'}`} detail={shortCommit(updateStatus?.currentCommit || '')} />
                        <VersionMetric label="最新版本" value={latestRelease?.tagName || '—'} detail={shortCommit(latestRelease?.commit || '')} />
                        <VersionMetric label="更新方式" value={updateStatus?.autoUpdateSupported ? '网页更新' : '手动更新'} detail={updateStatus?.autoUpdateSupported ? 'Updater 在线' : '需初始化 Sidecar'} />
                        <VersionMetric label="检查时间" value={latestRelease ? new Date(latestRelease.checkedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '—'} detail="GitHub Tags" />
                    </div>
                </div>

                <div className="space-y-4 p-6">
                    {updateStatus && updateStatus.state !== 'idle' && <div className={`rounded-xl border p-4 ${statusTone}`}>
                        <div className="flex items-center justify-between gap-4 text-sm font-semibold"><span className="flex items-center gap-2">{isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : updateStatus.state === 'succeeded' ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{stateLabels[updateStatus.state]}</span><span className="font-mono text-xs">{Math.max(0, Math.min(100, updateStatus.progress))}%</span></div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full bg-current transition-all duration-500" style={{width: `${Math.max(0, Math.min(100, updateStatus.progress))}%`}} /></div>
                        <p className="mt-3 text-sm leading-6 opacity-80">{updateStatus.message}</p>
                        {updateStatus.backupName && <p className="mt-1 flex items-center gap-1.5 text-xs opacity-70"><DatabaseBackup className="h-3.5 w-3.5" />备份：{updateStatus.backupName}</p>}
                    </div>}
                    {updateError && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><WifiOff className="mt-0.5 h-4 w-4 shrink-0" />{updateError}</div>}
                    {(updateStatus?.state === 'failed' || updateStatus?.state === 'rolledBack') && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><p className="font-semibold text-slate-800">需要服务器协助时</p><p className="mt-1 leading-6">请登录服务器执行 <code className="rounded bg-white px-1.5 py-0.5 text-xs">manager.sh update</code>，并通过 <code className="rounded bg-white px-1.5 py-0.5 text-xs">docker logs o-doc-updater</code> 查看更新器日志。数据库备份文件名见上方状态。</p></div>}
                    {!updateStatus?.autoUpdateSupported && <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><Server className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><div className="text-sm text-slate-600"><p className="font-semibold text-slate-800">网页更新尚未启用</p><p className="mt-1 leading-6">请先在 Linux 服务器执行一次最新版 <code className="rounded bg-white px-1.5 py-0.5 text-xs">manager.sh update</code>，安装更新 Sidecar。</p></div></div>}
                    {!isSuperuser && <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4" />只有超级管理员可以执行系统更新。</p>}
                    {!updateAvailable && latestRelease && !isUpdating && <p className="flex items-center gap-2 text-sm text-lime-700"><CheckCircle2 className="h-4 w-4" />当前已经是最新构建。</p>}
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-orange-50 p-2 text-orange-600"><UserRound className="h-5 w-5" /></div><div><p className="text-xs text-slate-500">作者</p><h4 className="font-bold text-slate-800">丢失的橘子</h4></div></div></div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Info className="h-5 w-5" /></div><div><p className="text-xs text-slate-500">{runtimeSource === 'server' ? '累计运行时间' : '运行时间加载中'}</p><h4 className="font-bold text-slate-800">{formatUptime(uptimeSeconds)}</h4></div></div></div>
            </div>

            <ConfirmationModal isOpen={confirmOpen} onClose={() => !isStarting && setConfirmOpen(false)} onConfirm={handleStartUpdate} title={`更新到 ${latestRelease?.tagName || '最新版本'}`} description={<div className="space-y-2"><p>更新器会先校验镜像并备份 PostgreSQL，然后重启应用容器。</p><p className="font-medium text-orange-700">期间页面可能暂时断开 1–3 分钟，请不要重复提交更新。</p></div>} confirmText="备份并更新" type="warning" isLoading={isStarting} />
        </div>
    );
};

const VersionMetric = ({label, value, detail}: {label: string; value: string; detail: string}) => (
    <div className="rounded-xl border border-white/80 bg-white/75 p-3 shadow-sm backdrop-blur">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 truncate font-mono text-sm font-bold text-slate-800">{value}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{detail}</p>
    </div>
);
