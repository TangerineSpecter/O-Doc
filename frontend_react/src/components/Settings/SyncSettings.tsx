import {useEffect, useRef, useState} from 'react';
import {DownloadCloud, HardDrive, Loader2, Play, Save, Terminal, UploadCloud} from 'lucide-react';
import {saveWebDavConfig, syncFromWebDav, syncToWebDav, WebDavConfig} from '@/api/setting.ts';
import {useToast} from '../common/ToastProvider'; // 引入 Toast

interface SyncSettingsProps {
    config: WebDavConfig;
    onChange: (config: WebDavConfig) => void;
}

export const SyncSettings = ({config, onChange}: SyncSettingsProps) => {
    const toast = useToast();

    // 独立的 Loading 状态，避免按钮互斥锁定
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // UI 状态
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);

    // 1. 测试连接并保存
    const handleSave = async () => {
        if (!config.url || !config.username || !config.password) {
            toast.warning('请填写完整的服务器地址、用户名和密码');
            return;
        }
        setIsSaving(true);
        try {
            await saveWebDavConfig(config);
            toast.success('连接成功，配置已保存');
        } catch (error: any) {
            const err = error as Error;
            console.error(err);
            toast.error(err.message || '连接失败，请检查配置');
        } finally {
            setIsSaving(false);
        }
    };

    // 2. 上传到 WebDAV
    const handleUpload = async () => {
        if (!config.enabled) {
            toast.warning('请先开启 WebDAV 同步开关并保存配置');
            return;
        }
        setIsUploading(true);
        try {
            const res = await syncToWebDav();
            toast.success(res.msg || '备份上传成功');
        } catch (err: any) {
            toast.error(err.response?.data?.msg || '上传失败');
        } finally {
            setIsUploading(false);
        }
    };

    // 3. 从 WebDAV 同步 (下载)
    const handleDownload = async () => {
        if (!config.enabled) {
            toast.warning('请先开启 WebDAV 同步开关并保存配置');
            return;
        }
        // 增加二次确认，防止误操作覆盖数据
        if (!window.confirm('确定要从云端同步数据吗？\n这将合并云端数据到本地，本地未上传的修改可能会被覆盖。')) {
            return;
        }

        setIsDownloading(true);
        try {
            const res = await syncFromWebDav();
            toast.success(res.msg || '数据同步成功');
            // 可选：同步成功后刷新页面以加载最新数据
            setTimeout(() => window.location.reload(), 1500);
        } catch (err: any) {
            toast.error(err.response?.data?.msg || '同步失败');
        } finally {
            setIsDownloading(false);
        }
    };

    // 自动滚动到底部的 Ref
    const logContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // --- 核心流式请求函数 ---
    const startSyncStream = async (direction: 'upload' | 'download') => {
        if (!config.enabled) return;

        setIsSyncing(true);
        setLogs([`🚀 开始${direction === 'upload' ? '上传' : '下载'}同步任务...`]);
        setProgress(0);

        try {
            const url = `/api/settings/config/sync_${direction === 'upload' ? 'to' : 'from'}_webdav/`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 如果有 token 鉴权，记得带上
                    // 'Authorization': `Token ${localStorage.getItem('token')}`
                },
            });

            if (!response.body) throw new Error("ReadableStream not supported");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                // 处理可能粘包的情况（多行数据一起过来）
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        // 更新日志
                        if (data.msg) {
                            setLogs(prev => [...prev, `> ${data.msg}`]);
                        }

                        // 更新进度条
                        if (data.progress) {
                            setProgress(data.progress);
                        }

                        if (data.step === 'done') {
                            setLogs(prev => [...prev, "✨ 同步任务成功结束。"]);
                        }
                    } catch (e) {
                        console.error("解析流数据失败", e);
                    }
                }
            }
        } catch (err) {
            setLogs(prev => [...prev, `❌ 错误: ${err}`]);
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
                        <h3 className="font-bold text-slate-800">WebDAV 同步</h3>
                        <p className="text-xs text-slate-500">将文档定期备份到第三方云存储</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">{config.enabled ? '已开启' : '已关闭'}</span>
                    <button
                        onClick={() => onChange({...config, enabled: !config.enabled})}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-orange-500' : 'bg-slate-200'}`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`}/>
                    </button>
                </div>
            </div>

            {/* 表单区域 */}
            <div
                className={`space-y-5 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
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

                {/* 远程路径字段 */}
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">远程路径 (Remote Path)</label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        placeholder="/o-doc-backup/"
                        value={config.remotePath || ''}
                        onChange={(e) => onChange({...config, remotePath: e.target.value})}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">数据将存储在此路径下，建议以 / 开头</p>
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
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">密码 / 应用令牌</label>
                        <input
                            type="password"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                            value={config.password}
                            onChange={(e) => onChange({...config, password: e.target.value})}
                        />
                    </div>
                </div>

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

                {/* 按钮操作区域 */}
                <div className="pt-4 flex flex-wrap gap-3 border-t border-slate-50 mt-2">
                    {/* 1. 测试并保存 */}
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg flex items-center gap-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
                        {isSaving ? '连接中...' : '测试连接并保存'}
                    </button>

                    <div className="flex-1"></div>

                    {/* 2. 上传到 WebDAV */}
                    <button
                        onClick={handleUpload}
                        disabled={isUploading}
                        className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-orange-200 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                            <UploadCloud className="w-3.5 h-3.5"/>}
                        {isUploading ? '上传中...' : '上传到 WebDAV'}
                    </button>

                    {/* 3. 从 WebDAV 同步 (下载) */}
                    <button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                            <DownloadCloud className="w-3.5 h-3.5"/>}
                        {isDownloading ? '同步中...' : '从 WebDAV 同步'}
                    </button>
                </div>
            </div>

            {/* --- 新增：同步控制台区域 --- */}
            <div className="mt-8 pt-6 border-t border-slate-100">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Terminal className="w-4 h-4"/>
                    同步控制台
                </h4>

                {/* 进度条 */}
                <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>总进度</span>
                        <span>{progress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-orange-500 transition-all duration-300 ease-out"
                            style={{width: `${progress}%`}}
                        />
                    </div>
                </div>

                {/* 黑客风格日志窗口 */}
                <div
                    ref={logContainerRef}
                    className="bg-slate-900 rounded-lg p-4 h-48 overflow-y-auto font-mono text-xs shadow-inner space-y-1"
                >
                    {logs.length === 0 ? (
                        <div className="text-slate-500 italic text-center mt-16">等待任务开始...</div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index}
                                 className="text-green-400 break-all animate-in fade-in slide-in-from-left-2 duration-300">
                                <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                                {log}
                            </div>
                        ))
                    )}
                    {/* 闪烁的光标 */}
                    {isSyncing && (
                        <div className="w-2 h-4 bg-green-500 animate-pulse mt-1 inline-block"/>
                    )}
                </div>

                {/* 按钮组 */}
                <div className="mt-4 flex gap-3 justify-end">
                    <button
                        onClick={() => startSyncStream('download')}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        从云端下载
                    </button>
                    <button
                        onClick={() => startSyncStream('upload')}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                        {isSyncing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Play className="w-3 h-3"/>}
                        开始上传同步
                    </button>
                </div>
            </div>
        </div>
    );
};