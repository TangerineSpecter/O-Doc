import React, {useEffect, useRef, useState} from 'react';
import {
    AlertCircle,
    Archive,
    ArrowDownToLine,
    ArrowUpDown,
    ArrowUpFromLine,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock3,
    CloudCog,
    CloudOff,
    Database,
    DownloadCloud,
    Eye,
    EyeOff,
    FolderTree,
    Globe,
    HardDrive,
    History,
    Info,
    KeyRound,
    Laptop,
    Loader2,
    Lock,
    Paperclip,
    Play,
    RefreshCw,
    Save,
    Server,
    Sparkles,
    Terminal,
    Trash2,
    User,
    XCircle
} from 'lucide-react';
import {
    SyncHistoryEntry,
    SyncProtocol,
    WebDavConfig,
    WebDavSyncStatus
} from '@/api/setting.ts';
import {useSyncOperations} from './sync/useSyncOperations';
import {SyncConfirmationModals} from './sync/SyncConfirmationModals';
import {
    defaultPortForProtocol,
    formatBytes,
    formatDateTime,
    formatTerminalLogContent,
    hostFromUrl,
    INTERVAL_PRESETS,
    PROTOCOL_OPTIONS,
    TRIGGER_CONFIG,
} from './sync/syncUtils';

interface SyncSettingsProps {
    config: WebDavConfig;
    status: WebDavSyncStatus;
    onChange: (config: WebDavConfig) => void;
    onRefreshStatus: () => Promise<void>;
}

export const SyncSettings = ({config, status, onChange, onRefreshStatus}: SyncSettingsProps) => {
    const {operationState, actions} = useSyncOperations({config, status, onChange, onRefreshStatus});
    const {
        isSaving,
        isSyncing,
        isExporting,
        isImporting,
        logs,
        progress,
        history,
        isRefreshingHistory,
        isRestoringHistory,
        isCancelling,
        isServerSyncing,
        isCancelRequested,
        isTransferBusy,
    } = operationState;

    // 弹窗状态管理（全部接入系统统一 ConfirmationModal）
    const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
    const [isDownloadConfirmOpen, setIsDownloadConfirmOpen] = useState(false);
    const [restoreConfirmSnapshot, setRestoreConfirmSnapshot] = useState<SyncHistoryEntry | null>(null);
    const [importConfirmFile, setImportConfirmFile] = useState<File | null>(null);

    // 界面折叠与显示状态
    const [showPassword, setShowPassword] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [isManifestHelpOpen, setIsManifestHelpOpen] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);

    const importInputRef = useRef<HTMLInputElement>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const refreshHistory = actions.refreshHistory;

    const statusMeta = {
        idle: {
            icon: Clock3,
            label: '就绪 / 等待同步',
            desc: '配置就绪，等待下一次触发',
            badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
            bgClass: 'bg-slate-50/70 border-slate-200'
        },
        running: {
            icon: Loader2,
            label: '同步传输中',
            desc: '正在与远端存储交换数据与资源',
            badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
            bgClass: 'bg-orange-50/40 border-orange-200'
        },
        success: {
            icon: CheckCircle2,
            label: '最近同步成功',
            desc: '本地与远端数据已保持一致',
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            bgClass: 'bg-emerald-50/40 border-emerald-200'
        },
        error: {
            icon: AlertCircle,
            label: '同步遇到异常',
            desc: '请查看控制台日志与错误信息',
            badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
            bgClass: 'bg-rose-50/40 border-rose-200'
        }
    }[status.status] || {
        icon: Clock3,
        label: status.status || '未知状态',
        desc: '等待系统检测',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        bgClass: 'bg-slate-50/70 border-slate-200'
    };
    const StatusIcon = statusMeta.icon;
    const protocol = config.protocol || 'webdav';

    const handleProtocolChange = (nextProtocol: SyncProtocol) => {
        const currentPort = config.port ?? null;
        const previousDefault = defaultPortForProtocol(protocol);
        const shouldResetPort = currentPort == null || currentPort === previousDefault;
        const parsed = nextProtocol === 'webdav' ? {host: config.host || '', port: null} : hostFromUrl(config.url);
        onChange({
            ...config,
            protocol: nextProtocol,
            host: nextProtocol === 'webdav' ? (config.host || '') : (config.host || parsed.host),
            port: nextProtocol === 'webdav'
                ? null
                : (shouldResetPort ? (parsed.port || defaultPortForProtocol(nextProtocol)) : currentPort),
        });
    };

    const handleSave = actions.saveConfig;
    const handleExportBackup = actions.exportBackup;

    const handleSelectImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) setImportConfirmFile(file);
    };

    const executeImportBackup = async () => {
        if (!importConfirmFile) return;
        if (await actions.importBackup(importConfirmFile)) {
            setImportConfirmFile(null);
        }
    };

    const executeRestoreHistory = async () => {
        if (!restoreConfirmSnapshot) return;
        if (await actions.restoreHistory(restoreConfirmSnapshot.snapshotId)) {
            setRestoreConfirmSnapshot(null);
        }
    };

    const handleCancelSync = async () => {
        if (await actions.cancelSync()) {
            setIsCancelConfirmOpen(false);
        }
    };

    const startSyncStream = actions.startSyncStream;
    return (
        <div className="space-y-6">
            {/* 1. 顶部概览与状态看板卡片 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
                    <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-500 shadow-sm shrink-0">
                            <CloudCog className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-800 text-base">同步与备份</h3>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${config.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${config.enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                    {config.enabled ? '已开启同步' : '已关闭同步'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">多端数据同步、云端备份与全量历史快照恢复</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                        <span className="text-xs font-medium text-slate-600">服务总开关</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={config.enabled}
                            onClick={() => onChange({...config, enabled: !config.enabled})}
                            disabled={isSaving}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60 ${config.enabled ? 'bg-orange-500' : 'bg-slate-200'}`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                            />
                        </button>
                    </div>
                </div>

                {/* 状态看板 Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                    {/* 左侧：运行状态卡片 */}
                    <div className={`rounded-xl border p-4 flex flex-col justify-between transition-all ${statusMeta.bgClass}`}>
                        <div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <StatusIcon className={`w-4 h-4 ${status.status === 'running' ? 'animate-spin text-orange-600' : 'text-slate-600'}`} />
                                    <span className="text-sm font-semibold text-slate-800">{statusMeta.label}</span>
                                </div>
                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusMeta.badgeClass}`}>
                                    {status.status.toUpperCase()}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">{statusMeta.desc}</p>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-xs">
                            <div>
                                <span className="text-slate-400 block text-[11px]">最近成功</span>
                                <span className="font-medium text-slate-700 truncate block mt-0.5" title={formatDateTime(status.lastSuccessAt)}>
                                    {formatDateTime(status.lastSuccessAt)}
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-400 block text-[11px]">最近开始</span>
                                <span className="font-medium text-slate-700 truncate block mt-0.5" title={formatDateTime(status.lastStartedAt)}>
                                    {formatDateTime(status.lastStartedAt)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 右侧：同步指标卡片 (彻底解决宽度折行问题) */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                                传输与快照指标
                            </span>
                            {status.trigger && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 font-medium text-slate-600 shadow-2xs">
                                    触发: {TRIGGER_CONFIG[status.trigger]?.label || status.trigger}
                                </span>
                            )}
                        </div>

                        {/* 上下两列指标，不折行 */}
                        <div className="grid grid-cols-2 gap-2.5 my-2.5">
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                                <span className="text-[11px] text-slate-400 block">最近上传时间</span>
                                <span className="text-xs font-semibold text-slate-700 block mt-0.5 font-sans truncate" title={formatDateTime(status.lastPushAt)}>
                                    {formatDateTime(status.lastPushAt)}
                                </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                                <span className="text-[11px] text-slate-400 block">最近拉取时间</span>
                                <span className="text-xs font-semibold text-slate-700 block mt-0.5 font-sans truncate" title={formatDateTime(status.lastPullAt)}>
                                    {formatDateTime(status.lastPullAt)}
                                </span>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                            <span className="text-slate-400 text-[11px]">远端快照 ID</span>
                            <span className="font-mono text-slate-700 text-[11px] truncate max-w-[200px]" title={status.lastSyncedSnapshotId}>
                                {status.lastSyncedSnapshotId || '暂无'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 错误提示条 */}
                {status.lastError && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-800 flex items-start gap-3 animate-in fade-in duration-200">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <span className="font-semibold block mb-0.5">同步发生异常</span>
                            <span className="text-rose-700 break-all font-mono leading-relaxed">{status.lastError}</span>
                        </div>
                    </div>
                )}

                {/* 上次同步摘要抽屉 */}
                {status.lastSummary?.length > 0 && logs.length === 0 && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/40 p-3.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setIsSummaryOpen(prev => !prev)}
                            className="w-full flex items-center justify-between text-slate-700 font-medium hover:text-slate-900 transition-colors"
                        >
                            <span className="flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                                最近一次同步变更摘要 ({status.lastSummary.length} 项)
                            </span>
                            {isSummaryOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {isSummaryOpen && (
                            <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-600 pr-1 animate-in fade-in duration-200">
                                {status.lastSummary.map((item, index) => (
                                    <div key={`${item}-${index}`} className="flex items-start gap-1.5">
                                        <span className="text-orange-500 shrink-0">›</span>
                                        <span className="break-all">{item}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. 远端历史快照卡片 (限制展示约3条，内部滚动) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                {/* 头部 */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                                <History className="w-4 h-4" />
                            </div>
                            <h3 className="font-bold text-slate-800 text-sm">远端历史快照</h3>
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                {history.length > 0 ? `共 ${history.length} 份快照 (保留最新 10 份)` : '保留最新 10 份'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            可随时恢复到任意云端快照；恢复前系统会自动为当前本机创建安全备份。
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setIsManifestHelpOpen(prev => !prev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="查看快照存储结构说明"
                        >
                            <Info className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">存储机制说明</span>
                        </button>
                        <button
                            type="button"
                            onClick={refreshHistory}
                            disabled={isTransferBusy || isRefreshingHistory}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-orange-300 hover:text-orange-600 text-slate-700 rounded-lg text-xs font-medium transition-all shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingHistory ? 'animate-spin text-orange-500' : ''}`} />
                            刷新快照
                        </button>
                    </div>
                </div>

                {/* 存储机制折叠提示 */}
                {isManifestHelpOpen && (
                    <div className="mb-4 p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-xl text-xs text-slate-600 space-y-1.5 animate-in fade-in duration-200">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <FolderTree className="w-4 h-4 text-orange-500" />
                            云端去重存储结构说明
                        </div>
                        <p className="leading-relaxed">
                            远端的图片、附件、ZIP 和头像等媒体资源会以全局去重后的哈希 Blob 格式存储于 <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200">sync-v2/blobs</code> 目录中。
                        </p>
                        <p className="leading-relaxed text-slate-500">
                            原始路径与文件名映射请在该快照元数据的 <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200">media_manifest.json</code> 中查看。
                        </p>
                    </div>
                )}

                {/* 快照列表 (限制最大高度，约展示最近 3 条，超出内部平滑滚动) */}
                {history.length === 0 ? (
                    <div className="py-10 flex flex-col items-center justify-center text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-300 mb-3">
                            <CloudOff className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-medium text-slate-600">暂无云端历史快照</p>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">开启同步并完成一次上传后，系统将自动在此按时间轴保留历史快照版本。</p>
                    </div>
                ) : (
                    <div className="space-y-2.5 max-h-[330px] overflow-y-auto pr-1">
                        {history.map((item, index) => {
                            const triggerConfig = TRIGGER_CONFIG[item.source] || { label: '同步上传', tone: 'bg-slate-100 text-slate-700 border-slate-200' };
                            const isRestoring = isRestoringHistory === item.snapshotId;

                            return (
                                <div
                                    key={item.snapshotId}
                                    className="group relative flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-orange-300 hover:shadow-sm transition-all duration-200"
                                >
                                    {/* 左侧：时间、触发类型与序号 */}
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-7 h-7 rounded-lg bg-slate-50 group-hover:bg-orange-50 border border-slate-100 group-hover:border-orange-200 flex items-center justify-center text-slate-500 group-hover:text-orange-600 shrink-0 transition-colors mt-0.5">
                                            <span className="text-xs font-mono font-bold">#{index + 1}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-bold text-slate-800 font-sans tracking-tight">
                                                    {formatDateTime(item.generatedAt)}
                                                </span>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${triggerConfig.tone}`}>
                                                    {triggerConfig.label}
                                                </span>
                                            </div>

                                            {/* 四维指标 Pills */}
                                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-slate-600">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-700 text-[11px]">
                                                    <Database className="w-3 h-3 text-slate-400" />
                                                    <span className="font-semibold text-slate-800">{item.recordCount || 0}</span> 条数据
                                                </span>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-700 text-[11px]">
                                                    <Paperclip className="w-3 h-3 text-slate-400" />
                                                    <span className="font-semibold text-slate-800">{item.mediaCount || 0}</span> 个媒体文件
                                                </span>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-700 text-[11px]">
                                                    <HardDrive className="w-3 h-3 text-slate-400" />
                                                    <span className="font-semibold text-slate-800">{formatBytes(item.snapshotBytes)}</span>
                                                </span>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-100 text-slate-500 font-mono text-[10px]">
                                                    <Laptop className="w-3 h-3 text-slate-400" />
                                                    设备 {item.deviceId?.slice(0, 8) || '未知'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 右侧：操作按钮 */}
                                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setRestoreConfirmSnapshot(item)}
                                            disabled={Boolean(isRestoringHistory) || isTransferBusy}
                                            className="px-3 py-1.5 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-600 border border-slate-200 hover:border-orange-300 rounded-lg text-xs font-medium transition-all shadow-2xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isRestoring ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-500" />
                                                    <span>正在恢复…</span>
                                                </>
                                            ) : (
                                                <>
                                                    <History className="w-3.5 h-3.5 text-slate-400 group-hover:text-orange-500" />
                                                    <span>恢复此版本</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 3. 本地备份与归档卡片 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2.5 mb-4 pb-4 border-b border-slate-100">
                    <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                        <Archive className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm">本地离线备份与迁移</h3>
                        <p className="text-xs text-slate-500 mt-0.5">将全量元数据导出为 ZIP 离线压缩包，或从离线包导入恢复</p>
                    </div>
                </div>

                <input
                    ref={importInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={handleSelectImportFile}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 导出备份 */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <ArrowDownToLine className="w-4 h-4 text-emerald-600" />
                                导出本地备份
                            </div>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                生成包含所有文集、文章属性与系统配置的备份包，保存在当前计算机中。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleExportBackup}
                            disabled={isExporting || isImporting || isServerSyncing}
                            className="w-full py-2 px-3 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-lg text-xs font-medium transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                            <span>{isExporting ? '正在打包导出…' : '立即导出备份文件 (.zip)'}</span>
                        </button>
                    </div>

                    {/* 导入备份 */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 flex flex-col justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                                <ArrowUpFromLine className="w-4 h-4 text-orange-600" />
                                导入本地备份
                            </div>
                            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                选中本地备份 ZIP 进行全量覆盖式导入，恢复系统所有文集与文章数据。
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => importInputRef.current?.click()}
                            disabled={isExporting || isImporting || isServerSyncing}
                            className="w-full py-2 px-3 bg-white hover:bg-orange-50 text-slate-700 hover:text-orange-700 border border-slate-200 hover:border-orange-300 rounded-lg text-xs font-medium transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                            <span>{isImporting ? '正在导入解析…' : '选择文件并导入覆盖'}</span>
                        </button>
                    </div>
                </div>

                <div className="mt-3.5 p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>说明：图书正文体积较大，离线包仅包含书籍信息与封面；书籍正文请走云端存储备份或书架取回。</span>
                </div>
            </div>

            {/* 4. 云端存储连接配置卡片 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-slate-100">
                    <div className="p-1.5 bg-orange-50 text-orange-600 rounded-lg">
                        <Server className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800 text-sm">云端存储服务器参数</h3>
                        <p className="text-xs text-slate-500 mt-0.5">配置与远端存储服务的连接协议、主机地址与认证信息</p>
                    </div>
                </div>

                <div className={`space-y-6 transition-opacity duration-200 ${config.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                    {/* 协议选择器 (3 项卡片式切换) */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-2">存储协议</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {PROTOCOL_OPTIONS.map(opt => {
                                const active = protocol === opt.value;
                                return (
                                    <div
                                        key={opt.value}
                                        onClick={() => handleProtocolChange(opt.value)}
                                        className={`cursor-pointer p-3.5 rounded-xl border transition-all flex flex-col justify-between ${
                                            active
                                                ? 'bg-orange-50/50 border-orange-500 ring-1 ring-orange-500 shadow-xs'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className={`text-sm font-bold ${active ? 'text-orange-700' : 'text-slate-800'}`}>
                                                {opt.label}
                                            </span>
                                            {active ? (
                                                <div className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                </div>
                                            ) : (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                                                    {opt.badge}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-tight">
                                            {opt.description}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {protocol === 'ftp' && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 flex items-start gap-2.5">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>标准 FTP 会明文传输账号密码与数据。若服务器支持，建议优先采用 SFTP，或开启下方的 FTPS (TLS) 加密。</span>
                        </div>
                    )}

                    {/* 地址与端口 */}
                    {protocol === 'webdav' ? (
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                WebDAV 服务器地址 (URL) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                    placeholder="https://dav.jianguoyun.com/dav/"
                                    value={config.url}
                                    onChange={(e) => onChange({...config, url: e.target.value})}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    主机地址 (Host) <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                    <input
                                        type="text"
                                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                        placeholder={protocol === 'sftp' ? 'sftp.example.com' : '192.168.1.10'}
                                        value={config.host || ''}
                                        onChange={(e) => onChange({...config, host: e.target.value})}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    端口 (Port)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={65535}
                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                    placeholder={String(defaultPortForProtocol(protocol) || '')}
                                    value={config.port ?? ''}
                                    onChange={(e) => onChange({
                                        ...config,
                                        port: e.target.value === '' ? null : Number(e.target.value)
                                    })}
                                />
                            </div>
                        </div>
                    )}

                    {/* FTP 专有设置 */}
                    {protocol === 'ftp' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
                                <div>
                                    <span className="font-semibold block text-slate-800">使用 FTPS (TLS)</span>
                                    <span className="text-[11px] text-slate-500 mt-0.5 block">开启传输层加密，保护账号与传输安全</span>
                                </div>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/20"
                                    checked={Boolean(config.useTls)}
                                    onChange={(e) => onChange({...config, useTls: e.target.checked})}
                                />
                            </label>
                            <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
                                <div>
                                    <span className="font-semibold block text-slate-800">被动模式 (PASV)</span>
                                    <span className="text-[11px] text-slate-500 mt-0.5 block">适用于 NAT、防火墙和局域网环境</span>
                                </div>
                                <input
                                    type="checkbox"
                                    className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500/20"
                                    checked={config.passive !== false}
                                    onChange={(e) => onChange({...config, passive: e.target.checked})}
                                />
                            </label>
                        </div>
                    )}

                    {/* 远程路径 */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                            远程保存路径 (Remote Path) <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <FolderTree className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all font-mono"
                                placeholder="例如 /o-doc-backup/ 或 /documents/"
                                value={config.remotePath || ''}
                                onChange={(e) => onChange({...config, remotePath: e.target.value})}
                            />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">云端保存快照与数据文件的根目录，必须填写以防误覆盖其他文件。</p>
                    </div>

                    {/* 认证信息 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                用户名 / 账号 <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder="输入存储账号用户名"
                                    value={config.username}
                                    onChange={(e) => onChange({...config, username: e.target.value})}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                {protocol === 'sftp' ? '密码（可选，与私钥二选一）' : '密码 / 应用令牌'} <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                    placeholder={protocol === 'webdav' ? '输入 WebDAV 专用应用授权密码' : '输入存储连接密码'}
                                    value={config.password}
                                    onChange={(e) => onChange({...config, password: e.target.value})}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* SFTP 私钥与口令 */}
                    {protocol === 'sftp' && (
                        <div className="space-y-4 pt-2 border-t border-slate-100">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                                    <span>私钥 PEM (OpenSSH Private Key)</span>
                                    <span className="text-[10px] text-slate-400 font-normal">可选，推荐使用私钥免密登录</span>
                                </label>
                                <textarea
                                    rows={4}
                                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-slate-800"
                                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
                                    value={config.privateKey || ''}
                                    onChange={(e) => onChange({...config, privateKey: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                    私钥口令 (Passphrase)
                                </label>
                                <div className="relative">
                                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                    <input
                                        type={showPassphrase ? 'text' : 'password'}
                                        className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                        placeholder="若私钥已加密，请输入对应口令"
                                        value={config.passphrase || ''}
                                        onChange={(e) => onChange({...config, passphrase: e.target.value})}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassphrase(!showPassphrase)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                    >
                                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 自动同步时间间隔 */}
                    <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <Clock3 className="w-3.5 h-3.5 text-slate-400" />
                                自动定时同步间隔
                            </label>
                            <span className="text-xs font-mono font-bold text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-md border border-orange-100">
                                每 {config.interval >= 60 ? `${(config.interval / 60).toFixed(1).replace('.0', '')} 小时` : `${config.interval} 分钟`}
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="5"
                                max="1440"
                                step="5"
                                className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                value={config.interval}
                                onChange={(e) => onChange({...config, interval: parseInt(e.target.value) || 30})}
                            />
                        </div>

                        {/* 常用预设快捷胶囊 */}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className="text-[11px] text-slate-400 mr-1">快捷预设:</span>
                            {INTERVAL_PRESETS.map(preset => (
                                <button
                                    key={preset.value}
                                    type="button"
                                    onClick={() => onChange({...config, interval: preset.value})}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                        config.interval === preset.value
                                            ? 'bg-orange-500 text-white shadow-xs'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* 5. 实时同步控制台与执行动作卡片 */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-slate-100 text-slate-700 rounded-lg">
                            <Terminal className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">同步控制台</h3>
                            <p className="text-xs text-slate-500 mt-0.5">查看实时同步传输日志与任务进度</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {isSyncing && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium px-2.5 py-0.5 bg-emerald-50 rounded-full border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                正在流式通信中
                            </span>
                        )}
                    </div>
                </div>

                {/* 进度条 */}
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>任务进度</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                            style={{width: `${progress}%`}}
                        />
                    </div>
                </div>

                {/* 经典黑客风格终端日志窗口 */}
                <div className="relative mb-4">
                    <div
                        ref={logContainerRef}
                        className="bg-slate-900 rounded-xl p-4 h-48 overflow-y-auto font-mono text-xs shadow-inner space-y-1 select-text"
                    >
                        {logs.length === 0 ? (
                            <div className="text-slate-500 italic text-center mt-16 select-none">
                                等待任务开始...
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div
                                    key={index}
                                    className="text-green-400 break-all leading-relaxed animate-in fade-in slide-in-from-left-1 duration-200"
                                >
                                    {formatTerminalLogContent(log)}
                                </div>
                            ))
                        )}
                        {/* 闪烁的绿色光标 */}
                        {isSyncing && (
                            <div className="w-2 h-4 bg-green-500 animate-pulse mt-1 inline-block" />
                        )}
                    </div>

                    {logs.length > 0 && (
                        <button
                            type="button"
                            onClick={actions.clearLogs}
                            className="absolute top-2.5 right-2.5 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 px-2 py-1 rounded-md flex items-center gap-1 transition-colors border border-slate-700/50 shadow-sm"
                        >
                            <Trash2 className="w-3 h-3" />
                            清屏
                        </button>
                    )}
                </div>

                {/* 底部操作按钮栏 (严格保持原先的上传下载按钮顺序与位置) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    {/* 1. 保存配置 (左侧) */}
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-2 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        保存配置并测试
                    </button>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* 终止任务按钮 (运行中展示) */}
                        {isServerSyncing && (
                            <button
                                type="button"
                                onClick={() => setIsCancelConfirmOpen(true)}
                                disabled={isCancelling || isCancelRequested}
                                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium rounded-lg flex items-center gap-2 transition-all border border-rose-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isCancelling || isCancelRequested ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                {isCancelRequested ? '正在终止…' : '终止同步'}
                            </button>
                        )}

                        {/* 2. 开始上传同步 (主操作，小橘橙色，放在前面/靠左位置以保持习惯) */}
                        <button
                            type="button"
                            onClick={() => startSyncStream('upload')}
                            disabled={isTransferBusy}
                            title={isServerSyncing ? '同步任务正在运行，暂时不能开始新的上传' : undefined}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-xs font-medium rounded-lg flex items-center gap-2 transition-all shadow-sm shadow-orange-500/20 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                            开始上传同步
                        </button>

                        {/* 3. 从云端下载按钮 (次级操作，白底边框，放在上传后面/靠右位置) */}
                        <button
                            type="button"
                            onClick={() => setIsDownloadConfirmOpen(true)}
                            disabled={isTransferBusy}
                            title={isServerSyncing ? '同步任务正在运行，暂时不能从云端下载' : undefined}
                            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg flex items-center gap-2 transition-all border border-slate-200 hover:border-slate-300 shadow-xs active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <DownloadCloud className="w-3.5 h-3.5" />
                            从云端下载
                        </button>
                    </div>
                </div>
            </div>

            <SyncConfirmationModals
                cancelOpen={isCancelConfirmOpen}
                downloadOpen={isDownloadConfirmOpen}
                restoreSnapshot={restoreConfirmSnapshot}
                importFile={importConfirmFile}
                isCancelling={isCancelling}
                isImporting={isImporting}
                isRestoring={Boolean(isRestoringHistory)}
                onCloseCancel={() => setIsCancelConfirmOpen(false)}
                onCloseDownload={() => setIsDownloadConfirmOpen(false)}
                onCloseRestore={() => setRestoreConfirmSnapshot(null)}
                onCloseImport={() => setImportConfirmFile(null)}
                onCancel={handleCancelSync}
                onDownload={async () => {
                    setIsDownloadConfirmOpen(false);
                    await startSyncStream('download');
                }}
                onRestore={executeRestoreHistory}
                onImport={executeImportBackup}
            />
        </div>
    );
};
