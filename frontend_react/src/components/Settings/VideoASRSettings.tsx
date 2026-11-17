import {Download, Loader2} from 'lucide-react';
import {useAuth} from '../../contexts/AuthContext';
import {useVideoASRModel} from '../../hooks/useVideoASRModel';

export function VideoASRSettings() {
    const {userInfo} = useAuth();
    const {status, error, busy, download, refresh} = useVideoASRModel();
    const active = status?.state === 'downloading' || status?.state === 'verifying';
    const progress = status ? Math.min(100, Math.round(status.downloadedBytes / status.totalBytes * 100)) : 0;
    return <section aria-labelledby="video-asr-heading" className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h3 id="video-asr-heading" className="text-base font-bold text-slate-800">视频转写模型</h3>
                <p className="mt-1 text-sm text-slate-600">Whisper Small 多语言模型 · 魔搭下载 · 约 464 MiB</p>
                <p className="mt-2 text-sm text-slate-600">用于无字幕视频。模型下载到运行 O-Doc 的服务器，关闭页面后仍会继续。</p>
            </div>
            {userInfo?.isSuperuser && status && status.state !== 'ready' && status.canDownload &&
                <button disabled={active || busy} onClick={() => void download()}
                    className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50">
                    {active || busy ? <Loader2 size={16} className="animate-spin"/> : <Download size={16}/>}
                    {active ? '正在准备模型' : status.state === 'failed' ? '重试下载' : '下载模型'}
                </button>}
        </div>
        <div className="mt-4 text-sm text-slate-600" role="status">
            {status?.message || (!error && '正在读取模型状态…')}
            {status && status.model !== 'small' && <p className="mt-1">当前服务器模型为 {status.model}，魔搭下载支持默认 small 模型。</p>}
            {!userInfo?.isSuperuser && status?.state !== 'ready' && <p className="mt-1">请由管理员在此下载模型。</p>}
        </div>
        {active && <div className="mt-3">
            <progress aria-label="转写模型下载进度" value={progress} max={100} className="h-2 w-full accent-orange-500"/>
            <p className="mt-1 text-xs text-slate-600">{progress}% · {Math.round((status?.downloadedBytes || 0) / 1024 ** 2)} / {Math.round((status?.totalBytes || 0) / 1024 ** 2)} MiB</p>
        </div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}
            <button onClick={refresh} className="ml-3 underline">重新读取</button>
        </p>}
    </section>;
}
