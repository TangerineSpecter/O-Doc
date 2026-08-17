import {useEffect, useRef, useState} from 'react';
import {AlertCircle, Archive, CheckCircle2, Clock3, DownloadCloud, HardDrive, Loader2, Play, Save, Terminal, UploadCloud} from 'lucide-react';
import {downloadLocalBackupFile, importLocalBackup, saveWebDavConfig, SyncProtocol, WebDavConfig, WebDavSyncStatus} from '@/api/setting.ts';
import {getAuthToken} from '@/utils/authStorage';
import {Select} from '../common/Select';
import {useToast} from '../common/ToastProvider';

const PROTOCOL_OPTIONS = [
    {value: 'webdav' as const, label: 'WebDAV', description: '坚果云、群晖、Nextcloud 等'},
    {value: 'ftp' as const, label: 'FTP / FTPS', description: '传统文件传输，可开启 TLS'},
    {value: 'sftp' as const, label: 'SFTP', description: '基于 SSH 的安全传输'},
];

const defaultPortForProtocol = (protocol: SyncProtocol) => protocol === 'sftp' ? 22 : protocol === 'ftp' ? 21 : null;

const TRIGGER_LABELS: Record<string, string> = {
    scheduler: '定时',
    manual: '手动上传',
    'manual-pull': '手动下载',
    'manual-preflight': '手动上传',
    'local-export': '导出备份',
    'local-import': '导入备份',
};

const hostFromUrl = (url: string) => {
    const raw = (url || '').trim();
    if (!raw) return {host: '', port: null as number | null};
    try {
        const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`);
        return {
            host: parsed.hostname || '',
            port: parsed.port ? Number(parsed.port) : null,
        };
    } catch {
        return {host: raw.split('/')[0].split(':')[0], port: null as number | null};
    }
};

interface SyncSettingsProps {
    config: WebDavConfig;
    status: WebDavSyncStatus;
    onChange: (config: WebDavConfig) => void;
    onRefreshStatus: () => Promise<void>;
}

export const SyncSettings = ({config, status, onChange, onRefreshStatus}: SyncSettingsProps) => {
    const {success, error, warning} = useToast();

    // 状态管理
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false); // 控制同步状态
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);    // 存储控制台日志
    const [progress, setProgress] = useState(0);       // 存储进度百分比
    const importInputRef = useRef<HTMLInputElement>(null);

    // 自动滚动到底部的 Ref
    const logContainerRef = useRef<HTMLDivElement>(null);
    const statusSummaryKeyRef = useRef('');
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    useEffect(() => {
        onRefreshStatus();
        const timer = window.setInterval(() => {
            onRefreshStatus();
        }, status.status === 'running' ? 5000 : 15000);

        return () => window.clearInterval(timer);
    }, [onRefreshStatus, status.status]);

    const isServerSyncing = status.status === 'running';
    const isTransferBusy = isSyncing || isServerSyncing;

    useEffect(() => {
        if (!isServerSyncing || isSyncing || !status.lastSummary?.length) {
            return;
        }

        const summaryKey = status.lastSummary.join('\n');
        if (summaryKey === statusSummaryKeyRef.current) {
            return;
        }

        statusSummaryKeyRef.current = summaryKey;
        setLogs([
            '⏱ 检测到定时同步正在运行，正在显示后端同步细节...',
            ...status.lastSummary.map(item => `> ${item}`)
        ]);
        setProgress(30);
    }, [isServerSyncing, isSyncing, status.lastSummary]);

    const formatDateTime = (value?: string) => {
        if (!value) return '暂无';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    };

    const statusMeta = {
        idle: {
            icon: Clock3,
            label: '等待同步',
            tone: 'text-slate-600 bg-slate-100 border-slate-200'
        },
        running: {
            icon: Loader2,
            label: '同步中',
            tone: 'text-indigo-700 bg-indigo-50 border-indigo-200'
        },
        success: {
            icon: CheckCircle2,
            label: '最近成功',
            tone: 'text-emerald-700 bg-emerald-50 border-emerald-200'
        },
        error: {
            icon: AlertCircle,
            label: '最近失败',
            tone: 'text-rose-700 bg-rose-50 border-rose-200'
        }
    }[status.status] || {
        icon: Clock3,
        label: status.status || '未知状态',
        tone: 'text-slate-600 bg-slate-100 border-slate-200'
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

    // 1. 测试连接并保存 (保持原逻辑)
    const handleSave = async () => {
        const host = config.host || config.url;
        if (!config.remotePath?.trim()) {
            warning('请填写远程路径，不要留空');
            return;
        }
        if (protocol === 'webdav' && (!config.url || !config.username || !config.password)) {
            warning('请填写完整的 WebDAV 地址、用户名和密码');
            return;
        }
        if (protocol === 'ftp' && (!host || !config.username || !config.password)) {
            warning('请填写完整的 FTP 主机、用户名和密码');
            return;
        }
        if (protocol === 'sftp' && (!host || !config.username || (!config.password && !config.privateKey))) {
            warning('请填写完整的 SFTP 主机、用户名，以及密码或私钥');
            return;
        }
        setIsSaving(true);
        try {
            await saveWebDavConfig(config);
            success('连接成功，配置已保存');
            await onRefreshStatus();
        } catch (err: any) {
            console.error(err);
            error(err.response?.data?.msg || '连接失败，请检查配置');
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportBackup = async () => {
        if (isServerSyncing || isImporting || isExporting) {
            warning('请等待当前任务完成后再导出');
            return;
        }
        setIsExporting(true);
        try {
            const {blob, filename} = await downloadLocalBackupFile();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            success('备份压缩包已开始下载');
        } catch (err: any) {
            error(err.message || '导出备份失败');
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!window.confirm('导入会用压缩包全量覆盖当前数据。图书正文不在压缩包里，闪念等未包含的内容也不会恢复。确定继续？')) {
            return;
        }
        setIsImporting(true);
        try {
            await importLocalBackup(file);
            success('备份已导入，即将刷新页面');
            setTimeout(() => window.location.reload(), 1200);
        } catch (err: any) {
            error(err.response?.data?.msg || err.message || '导入备份失败');
        } finally {
            setIsImporting(false);
        }
    };

    // --- 核心：流式同步处理函数 ---
    // 这里不再调用 api/setting.ts，而是直接用 fetch 以绕过 axios 拦截器
    const startSyncStream = async (direction: 'upload' | 'download') => {
        if (!config.enabled) {
            warning('请先开启同步开关并保存配置');
            return;
        }
        if (isServerSyncing) {
            warning('当前已有同步任务正在运行，请等待完成后再操作');
            return;
        }

        try {
            await saveWebDavConfig(config);
            await onRefreshStatus();
        } catch (err: any) {
            error(err.response?.data?.msg || '请先保存并测试通过当前备份配置，再开始同步');
            return;
        }

        if (direction === 'download') {
            if (!window.confirm('确定要从云端同步数据吗？\n这会用云端快照对齐本地：快照里没有的文集、图书、图片等记录会被删除，本地未上传的修改也会丢失。')) {
                return;
            }
        }

        setIsSyncing(true);
        statusSummaryKeyRef.current = '';
        setLogs([`🚀 开始${direction === 'upload' ? '上传' : '下载'}同步任务...`]);
        setProgress(0);

        try {
            // 拼接 URL
            const url = `/api/settings/config/sync_${direction === 'upload' ? 'to' : 'from'}_webdav/`;

            const token = getAuthToken();

            // 发起原生 fetch 请求
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 2. 显式添加认证头
                    ...(token ? { 'Authorization': `Token ${token}` } : {})
                },
            });

            if (!response.ok) {
                // 如果不是 200，尝试读取错误信息
                const errText = await response.text();
                throw new Error(`请求失败: ${response.status} ${errText}`);
            }

            if (!response.body) throw new Error("浏览器不支持 ReadableStream");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            const handleLine = (line: string) => {
                if (!line.trim()) return;

                const data = JSON.parse(line);

                if (typeof data.code === 'number' && data.code !== 200) {
                    throw new Error(data.msg || '同步失败');
                }

                if (data.msg) {
                    let prefix = '> ';
                    if (data.step === 'error') prefix = '❌ ';
                    if (data.step === 'summary' || data.step === 'done') prefix = '✨ ';

                    setLogs(prev => [...prev, `${prefix}${data.msg}`]);
                }

                if (data.progress !== undefined) {
                    setProgress(data.progress);
                }

                if (data.step === 'error') {
                    throw new Error(data.msg || '同步失败');
                }

                if (data.step === 'done') {
                    success(`${direction === 'upload' ? '上传' : '下载'}完成`);
                    onRefreshStatus();
                    setProgress(100);
                    if (direction === 'download') {
                        setTimeout(() => window.location.reload(), 1500);
                    }
                }
            };

            // 循环读取流数据
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, {stream: true});
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    try {
                        handleLine(line);
                    } catch (e) {
                        if (e instanceof SyntaxError) {
                            console.warn("解析日志失败:", line);
                            continue;
                        }
                        throw e;
                    }
                }
            }

            const finalChunk = buffer.trim();
            if (finalChunk) {
                handleLine(finalChunk);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `❌ 错误: ${err.message || err}`]);
            error('同步过程中发生错误');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            {/* 头部标题区域 */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <HardDrive className="w-5 h-5"/>
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">同步与备份</h3>
                        <p className="text-xs text-slate-500">将文档定期备份到 WebDAV、FTP 或 SFTP</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{config.enabled ? '已开启' : '已关闭'}</span>
                    <button
                        onClick={() => onChange({...config, enabled: !config.enabled})}
                        disabled={isSaving}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-orange-500' : 'bg-slate-200'}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                    </button>
                </div>
            </div>

            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`rounded-xl border px-4 py-3 ${statusMeta.tone}`}>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                        <StatusIcon className={`w-4 h-4 ${status.status === 'running' ? 'animate-spin' : ''}`}/>
                        {statusMeta.label}
                    </div>
                    <p className="mt-2 text-xs opacity-80">最近成功时间：{formatDateTime(status.lastSuccessAt)}</p>
                    <p className="mt-1 text-xs opacity-80">最近开始时间：{formatDateTime(status.lastStartedAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <UploadCloud className="w-4 h-4"/>
                        同步状态
                    </div>
                    <p>最近上传：{formatDateTime(status.lastPushAt)}</p>
                    <p>最近拉取：{formatDateTime(status.lastPullAt)}</p>
                    <p>触发方式：{TRIGGER_LABELS[status.trigger] || status.trigger || '暂无'}</p>
                    <p>远端快照：{status.lastSyncedSnapshotId || '暂无'}</p>
                </div>
            </div>

            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Archive className="h-4 w-4"/>
                    导出 / 导入本地备份
                </div>
                <p className="mb-3 text-xs leading-5 text-slate-500">
                    导出当前数据为压缩包，保存在本机。图书正文体积大，不会打进压缩包，只带书籍信息和封面；正文请继续走远端备份，或在书架上按本取回。导入会按压缩包全量覆盖，比当前系统更新的备份无法导入。
                </p>
                <input
                    ref={importInputRef}
                    type="file"
                    accept=".zip,application/zip"
                    className="hidden"
                    onChange={handleImportBackup}
                />
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleExportBackup}
                        disabled={isExporting || isImporting || isServerSyncing}
                        className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-slate-200 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Archive className="w-3.5 h-3.5"/>}
                        导出备份
                    </button>
                    <button
                        onClick={() => importInputRef.current?.click()}
                        disabled={isExporting || isImporting || isServerSyncing}
                        className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-slate-200 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <DownloadCloud className="w-3.5 h-3.5"/>}
                        导入备份
                    </button>
                </div>
            </div>

            {status.lastError && (
                <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    <div className="font-semibold mb-1">最近一次错误</div>
                    <div className="break-all">{status.lastError}</div>
                </div>
            )}

            {status.lastSummary?.length > 0 && logs.length === 0 && (
                <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <div className="text-sm font-semibold text-slate-800 mb-2">最近一次同步摘要</div>
                    <div className="max-h-32 overflow-y-auto pr-1 space-y-1 text-xs text-slate-600">
                        {status.lastSummary.map((item, index) => (
                            <div key={`${item}-${index}`} className="break-words">{item}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* 表单区域 */}
            <div
                className={`space-y-5 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">备份方式</label>
                    <Select
                        value={protocol}
                        options={PROTOCOL_OPTIONS}
                        onChange={handleProtocolChange}
                    />
                </div>

                {protocol === 'ftp' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                        FTP 会明文传输账号和文件。如服务器支持，请优先使用 SFTP，或开启下方的 FTPS。
                    </div>
                )}

                {protocol === 'webdav' ? (
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">服务器地址 (URL)</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            placeholder="https://dav.jianguoyun.com/dav/"
                            value={config.url}
                            onChange={(e) => onChange({...config, url: e.target.value})}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">主机地址</label>
                            <input
                                type="text"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                placeholder={protocol === 'sftp' ? 'sftp.example.com' : '192.168.1.10'}
                                value={config.host || ''}
                                onChange={(e) => onChange({...config, host: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">端口</label>
                            <input
                                type="number"
                                min={1}
                                max={65535}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
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

                {protocol === 'ftp' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                            <span>使用 FTPS (TLS)</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-orange-500"
                                checked={Boolean(config.useTls)}
                                onChange={(e) => onChange({...config, useTls: e.target.checked})}
                            />
                        </label>
                        <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                            <span>被动模式 (PASV)</span>
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-orange-500"
                                checked={config.passive !== false}
                                onChange={(e) => onChange({...config, passive: e.target.checked})}
                            />
                        </label>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">远程路径 (Remote Path)</label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        placeholder="例如 /o-doc-backup/，必须手动填写"
                        value={config.remotePath || ''}
                        onChange={(e) => onChange({...config, remotePath: e.target.value})}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">用户名</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            value={config.username}
                            onChange={(e) => onChange({...config, username: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                            {protocol === 'sftp' ? '密码（可选）' : '密码 / 应用令牌'}
                        </label>
                        <input
                            type="password"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            value={config.password}
                            onChange={(e) => onChange({...config, password: e.target.value})}
                        />
                    </div>
                </div>
                {protocol === 'sftp' && (
                    <>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">私钥 PEM（可选）</label>
                            <textarea
                                rows={4}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                                value={config.privateKey || ''}
                                onChange={(e) => onChange({...config, privateKey: e.target.value})}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1.5">私钥口令（可选）</label>
                            <input
                                type="password"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                value={config.passphrase || ''}
                                onChange={(e) => onChange({...config, passphrase: e.target.value})}
                            />
                        </div>
                    </>
                )}
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">自动同步间隔 (分钟)</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min="5" max="1440" step="5"
                            className="flex-1 accent-orange-500 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                            value={config.interval}
                            onChange={(e) => onChange({...config, interval: parseInt(e.target.value)})}
                        />
                        <span
                            className="text-sm font-mono bg-slate-100 px-2 py-1 rounded min-w-[3rem] text-center">{config.interval}m</span>
                    </div>
                </div>
                <div className="mt-8 pt-6 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Terminal className="w-4 h-4"/>
                        同步控制台
                    </h4>

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

                    {/* 黑客风格日志窗口 */}
                    <div
                        ref={logContainerRef}
                        className="bg-slate-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs shadow-inner space-y-1 mb-4"
                    >
                        {logs.length === 0 ? (
                            <div className="text-slate-500 italic text-center mt-16 select-none">等待任务开始...</div>
                        ) : (
                            logs.map((log, index) => (
                                <div key={index}
                                     className="text-green-400 break-all animate-in fade-in slide-in-from-left-2 duration-300">
                                    <span className="text-slate-600 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                    {log}
                                </div>
                            ))
                        )}
                        {/* 闪烁的光标 */}
                        {isSyncing && (
                            <div className="w-2 h-4 bg-green-500 animate-pulse mt-1 inline-block"/>
                        )}
                    </div>

                    {/* 按钮操作区域 */}
                    <div className="flex flex-wrap gap-3">
                        {/* 1. 测试并保存 (不做流式) */}
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                                <Save className="w-3.5 h-3.5"/>}
                            保存配置
                        </button>

                        <div className="flex-1"></div>

                        {/* 2. 上传按钮 (调用流式方法) */}
                        <button
                            onClick={() => startSyncStream('upload')}
                            disabled={isTransferBusy}
                            title={isServerSyncing ? '同步任务正在运行，暂时不能开始新的上传' : undefined}
                            className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-orange-200 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                                <Play className="w-3.5 h-3.5"/>}
                            开始上传同步
                        </button>

                        {/* 3. 下载按钮 (调用流式方法) */}
                        <button
                            onClick={() => startSyncStream('download')}
                            disabled={isTransferBusy}
                            title={isServerSyncing ? '同步任务正在运行，暂时不能从云端下载' : undefined}
                            className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            <DownloadCloud className="w-3.5 h-3.5"/>
                            从云端下载
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
