import {HardDrive, UploadCloud, DownloadCloud, Save} from 'lucide-react';
import {WebDavConfig} from '@/api/setting.ts';

interface SyncSettingsProps {
    config: WebDavConfig;
    onChange: (config: WebDavConfig) => void;
    // 您可以在此处添加额外的回调 props，例如 onTestConnection, onUpload, onDownload 等
    // onTestAndSave?: () => void;
    // onUpload?: () => void;
    // onDownload?: () => void;
}

export const SyncSettings = ({config, onChange}: SyncSettingsProps) => {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
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

            <div
                className={`space-y-5 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">服务器地址 (URL)</label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                        placeholder="https://dav.jianguoyun.com/dav/"
                        value={config.url}
                        onChange={(e) => onChange({...config, url: e.target.value})}
                    />
                </div>

                {/* [新增] 远程路径设置 */}
                <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1.5">远程路径 (Remote Path)</label>
                    <input
                        type="text"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                        placeholder="/o-doc-backup/"
                        value={config.remotePath || ''}
                        onChange={(e) => onChange({...config, remotePath: e.target.value})}
                    />
                    <p className="mt-1 text-[10px] text-slate-400">文件将存储在此路径下，请确保以 / 开头和结尾</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">用户名</label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                            value={config.username}
                            onChange={(e) => onChange({...config, username: e.target.value})}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">密码 / 应用令牌</label>
                        <input
                            type="password"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
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

                {/* [修改] 按钮操作区域 */}
                <div className="pt-4 flex flex-wrap gap-3 border-t border-slate-50 mt-2">
                    {/* 1. 测试并保存 */}
                    <button
                        className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded-lg flex items-center gap-2 transition-colors">
                        <Save className="w-3.5 h-3.5"/>
                        测试连接并保存配置
                    </button>

                    <div className="flex-1"></div>

                    {/* 2. 上传到 WebDAV */}
                    <button
                        className="px-3 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-orange-200">
                        <UploadCloud className="w-3.5 h-3.5"/>
                        上传到 WebDAV
                    </button>

                    {/* 3. 从 WebDAV 同步 (下载) */}
                    <button
                        className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs rounded-lg flex items-center gap-2 transition-colors border border-indigo-200">
                        <DownloadCloud className="w-3.5 h-3.5"/>
                        从 WebDAV 同步
                    </button>
                </div>
            </div>
        </div>
    );
};