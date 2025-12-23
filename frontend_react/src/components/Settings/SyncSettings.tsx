import {useEffect, useRef, useState} from 'react';
import {DownloadCloud, HardDrive, Loader2, Play, Save, Terminal} from 'lucide-react';
import {saveWebDavConfig, WebDavConfig} from '@/api/setting.ts';
import {useToast} from '../common/ToastProvider';

interface SyncSettingsProps {
    config: WebDavConfig;
    onChange: (config: WebDavConfig) => void;
}

export const SyncSettings = ({config, onChange}: SyncSettingsProps) => {
    const {success, error, warning} = useToast();

    // 状态管理
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false); // 控制同步状态
    const [logs, setLogs] = useState<string[]>([]);    // 存储控制台日志
    const [progress, setProgress] = useState(0);       // 存储进度百分比

    // 自动滚动到底部的 Ref
    const logContainerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    // 1. 测试连接并保存 (保持原逻辑)
    const handleSave = async () => {
        if (!config.url || !config.username || !config.password) {
            warning('请填写完整的服务器地址、用户名和密码');
            return;
        }
        setIsSaving(true);
        try {
            await saveWebDavConfig(config);
            success('连接成功，配置已保存');
        } catch (err: any) {
            console.error(err);
            error(err.response?.data?.msg || '连接失败，请检查配置');
        } finally {
            setIsSaving(false);
        }
    };

    // --- 核心：流式同步处理函数 ---
    // 这里不再调用 api/setting.ts，而是直接用 fetch 以绕过 axios 拦截器
    const startSyncStream = async (direction: 'upload' | 'download') => {
        if (!config.enabled) {
            warning('请先开启 WebDAV 同步开关并保存配置');
            return;
        }

        if (direction === 'download') {
            if (!window.confirm('确定要从云端同步数据吗？\n这将合并云端数据到本地，本地未上传的修改可能会被覆盖。')) {
                return;
            }
        }

        setIsSyncing(true);
        setLogs([`🚀 开始${direction === 'upload' ? '上传' : '下载'}同步任务...`]);
        setProgress(0);

        try {
            // 拼接 URL
            const url = `/api/settings/config/sync_${direction === 'upload' ? 'to' : 'from'}_webdav/`;

            const token = localStorage.getItem('token');

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

            // 循环读取流数据
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, {stream: true});
                // 处理“粘包”：后端可能一次发过来多行数据，按换行符切割
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        // 1. 更新日志
                        if (data.msg) {
                            // 如果是 summary 或 error，加上特殊标记
                            let prefix = '> ';
                            if (data.step === 'error') prefix = '❌ ';
                            if (data.step === 'summary' || data.step === 'done') prefix = '✨ ';

                            setLogs(prev => [...prev, `${prefix}${data.msg}`]);
                        }

                        // 2. 更新进度条 (如果有 progress 字段)
                        if (data.progress !== undefined) {
                            setProgress(data.progress);
                        }

                        // 3. 结束信号
                        if (data.step === 'done') {
                            success(`${direction === 'upload' ? '上传' : '下载'}完成`);
                            if (direction === 'download') {
                                setTimeout(() => window.location.reload(), 1500);
                            }
                        }
                    } catch (e) {
                        console.warn("解析日志失败:", line);
                    }
                }
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
                {/* ... 输入框部分保持不变，为了节省篇幅我省略了输入框的重复代码 ... */}
                {/* 请保留你原来的 URL、RemotePath、Username、Password、Interval 输入框代码 */}

                {/* --- 这里把原来的 Input 代码放回来 --- */}
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
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">远程路径 (Remote Path)</label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                        placeholder="/o-doc-backup/"
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
                {/* --- Input 代码结束 --- */}


                {/* === 新增：同步控制台 (Terminal UI) === */}
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
                            disabled={isSaving || isSyncing}
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
                            disabled={isSyncing}
                            className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-orange-200 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> :
                                <Play className="w-3.5 h-3.5"/>}
                            开始上传同步
                        </button>

                        {/* 3. 下载按钮 (调用流式方法) */}
                        <button
                            onClick={() => startSyncStream('download')}
                            disabled={isSyncing}
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