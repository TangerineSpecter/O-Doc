import {useRef} from 'react';
import {createPortal} from 'react-dom';
import {Film, Loader2, X} from 'lucide-react';
import {useVideoNotes} from '../../hooks/useVideoNotes';
import {useEscapeDismissal} from '../../hooks/useEscapeDismissal';

interface Props {
    collId: string;
    onClose: () => void;
    onOpen: (id: string) => void;
}

export default function VideoNoteModal({collId, onClose, onOpen}: Props) {
    const task = useVideoNotes(collId);
    const fileInput = useRef<HTMLInputElement>(null);
    const uploadId = useRef('');
    useEscapeDismissal(true, onClose);

    return createPortal(<div data-modal-scroll-lock className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-4"
        onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="video-note-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <header className="mb-4 flex items-center justify-between">
                <h2 id="video-note-title" className="flex items-center gap-2 text-lg font-bold text-slate-800">
                    <Film size={20} className="text-orange-500"/>视频笔记
                </h2>
                <button aria-label="关闭视频笔记" onClick={onClose} className="rounded p-1 text-slate-500"><X size={18}/></button>
            </header>
            <form onSubmit={e => { e.preventDefault(); void task.submit(); }}>
                <label htmlFor="video-note-link" className="text-sm font-medium">视频分享链接</label>
                <textarea id="video-note-link" autoFocus rows={2} value={task.text} maxLength={5000}
                    placeholder="粘贴 B 站或抖音链接，也可以粘贴整段分享文本"
                    onChange={e => task.setText(e.target.value)}
                    className="mt-2 w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:border-orange-400 focus:outline-none"/>
                <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-500">关闭弹窗后也会继续处理</span>
                    <button disabled={!task.text.trim() || task.busy}
                        className="rounded-lg bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600 disabled:opacity-50">
                        生成笔记
                    </button>
                </div>
            </form>
            {task.error && <p role="alert" className="mt-4 text-sm text-red-600">{task.error}
                <button onClick={task.refresh} className="ml-2 underline">刷新任务</button></p>}
            <h3 className="mt-5 border-t border-slate-100 pt-4 text-sm font-semibold">本机最近任务</h3>
            <div className="scrollbar-hide mt-2 max-h-[42vh] space-y-2 overflow-y-auto">
                {task.loading ? <p role="status" className="text-xs text-slate-500">正在读取任务…</p> :
                    !task.jobs.length && !task.error && <p className="text-xs text-slate-500">当前文集还没有视频任务</p>}
                {task.jobs.map(job => <div key={job.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p className="truncate font-medium text-slate-800" title={job.title || job.sourceUrl}>{job.title || job.sourceUrl}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                        {job.state === 'running' && <Loader2 size={12} className="animate-spin"/>}{job.stage}</p>
                    {job.message && <p className="mt-1 text-xs text-slate-600">{job.message}</p>}
                    {job.state === 'completed' && <button className="mt-2 text-orange-700" onClick={() => onOpen(job.articleId)}>打开笔记</button>}
                    {['awaiting_upload', 'failed'].includes(job.state) && <div className="mt-2 flex gap-4">
                        <button className="text-orange-700" disabled={task.busy} onClick={() => {
                            uploadId.current = job.id;
                            fileInput.current?.click();
                        }}>上传视频继续</button>
                        <button className="text-slate-600" disabled={task.busy} onClick={() => void task.retry(job.id)}>重试</button>
                    </div>}
                </div>)}
            </div>
            <input hidden type="file" accept=".mp4,.mov,.webm,.mkv" ref={fileInput} onChange={e => {
                const file = e.target.files?.[0];
                if (file) void task.upload(uploadId.current, file);
                e.target.value = '';
            }}/>
        </section>
    </div>, document.body);
}
