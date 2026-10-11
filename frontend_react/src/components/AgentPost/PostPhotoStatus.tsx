import ConfirmationModal from '@/components/common/ConfirmationModal';
import {ImagePlus, Loader2, RefreshCw, Search, Trash2} from 'lucide-react';
import {useState} from 'react';
import {usePostPhoto} from '@/hooks/usePostPhoto';

export function PostPhotoStatus({postId, onChanged}: {postId: string; onChanged: () => void}) {
    const {state, error, busy, operate} = usePostPhoto(postId, onChanged);
    const [confirmGenerate, setConfirmGenerate] = useState(false);
    const [confirmRegenerate, setConfirmRegenerate] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const pending = ['pending', 'generating'].includes(state.status || '');
    const paused = ['paused', 'query_required', 'submission_unknown'].includes(state.status || '');
    const downloadInterrupted = Boolean(state.canRetryDownload && state.error);
    const recovering = busy || Boolean(state.recovering);
    const retryAfter = state.retryAfterSeconds || 0;
    const stageLabels: Record<string, string> = {pending: '等待后台处理', submitting: '正在提交到生图服务', generating: '生图服务正在生成', download_pending: '生成完成，正在下载保存', succeeded: '图片已保存，等待加入正文'};
    const canGenerate = !state.status || state.status === 'removed';
    const canRegenerate = ['inserted', 'failed', 'cancelled', 'manual'].includes(state.status || '');
    const canRemove = Boolean(state.hasImage) && !pending && !paused && state.status !== 'abandoned';

    if (!state.canManage && (!state.status || ['inserted', 'removed', 'abandoned'].includes(state.status))) return null;

    return <>
        <aside className="mx-6 my-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:mx-10" aria-label="帖子配图管理">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <ImagePlus className="h-4 w-4 text-orange-500" />帖子配图
                    </p>
                    {pending && <p className="mt-1 text-xs leading-5 text-slate-500">
                        {downloadInterrupted ? '图片已生成，下载保存待重试' : stageLabels[state.stage || 'pending'] || '正在查询结果'} · 已等待 {Math.floor((state.elapsedSeconds || 0) / 60)} 分钟
                        {state.lastUpdatedAt && ` · 最近更新 ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`}
                        。超过 30 分钟会暂停自动查询，保留原请求。
                    </p>}
                    {pending && state.error && <p role="status" className="mt-1 text-xs leading-5 text-amber-700">{state.error}</p>}
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                        {pending
                            ? downloadInterrupted
                                ? '可点击“重试下载”恢复原结果，不会重新生图。' + (state.hasImage ? '当前配图仍保留。' : '保存成功后才会插入正文。')
                                : state.hasImage ? '当前配图仍保留，新图保存成功后再替换。' : '图片保存成功后会自动插入正文。'
                            : state.status === 'inserted' ? '配图已加入正文，可重新生成或从帖子移除。'
                                : state.status === 'manual' ? '新图已生成；正文有修改，请确认后插入。'
                                    : state.status === 'removed' ? '配图已从帖子正文移除。'
                                        : paused ? state.error || '需要查询原请求后才能继续。'
                                            : state.status === 'failed' && state.hasImage ? '重新生成失败，原配图仍保留。'
                                                : state.status === 'abandoned' ? state.error || '帖子已删除，配图任务已结束。'
                                                    : state.error || '根据帖子主题生成旅行同款 Q 版手绘配图。'}
                    </p>
                </div>
                {state.canManage && <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {canGenerate && <button type="button" disabled={busy} onClick={() => setConfirmGenerate(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
                        <ImagePlus className="h-3.5 w-3.5" />补配图
                    </button>}
                    {canRegenerate && <button type="button" disabled={busy} onClick={() => setConfirmRegenerate(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-orange-200 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
                        <RefreshCw className="h-3.5 w-3.5" />重新生成
                    </button>}
                    {(paused || pending) && <button type="button" disabled={recovering || retryAfter > 0} onClick={() => void operate('query')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
                        {recovering ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Search className="h-3.5 w-3.5" />}{recovering ? '正在恢复原结果…' : retryAfter > 0 ? `稍后重试（${retryAfter} 秒）` : downloadInterrupted ? '重试下载' : '查询原请求'}
                    </button>}
                    {state.status === 'manual' && <button type="button" disabled={busy} onClick={() => void operate('use_image')} className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60">插入新图</button>}
                    {canRemove && <button type="button" disabled={busy} onClick={() => setConfirmRemove(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-60">
                        <Trash2 className="h-3.5 w-3.5" />移除配图
                    </button>}
                    {pending && <span className="inline-flex items-center gap-1.5 px-2 text-xs text-orange-600">{!downloadInterrupted && <Loader2 className="h-3.5 w-3.5 animate-spin"/>}{downloadInterrupted ? '下载待恢复' : '处理中'}</span>}
                </div>}
            </div>
            {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
            {state.status === 'manual' && state.imageUrl && <img src={state.imageUrl} alt="待插入的帖子配图" className="mt-3 max-h-64 rounded-xl object-contain"/>}
        </aside>
        <ConfirmationModal isOpen={confirmGenerate} onClose={() => setConfirmGenerate(false)} onConfirm={() => {setConfirmGenerate(false); void operate('generate');}} title="为帖子补一张配图" type="warning" description="将根据帖子标题和正文生成旅行同款 Q 版手绘图。生图服务可能产生费用，是否继续？" confirmText="确认生成"/>
        <ConfirmationModal isOpen={confirmRegenerate} onClose={() => setConfirmRegenerate(false)} onConfirm={() => {setConfirmRegenerate(false); void operate('retry');}} title="重新生成帖子配图" type="warning" description="这会调用生图服务，可能产生费用。新图成功后会替换当前配图；如果生成失败，原图会保留。是否继续？" confirmText="确认生成"/>
        <ConfirmationModal isOpen={confirmRemove} onClose={() => setConfirmRemove(false)} onConfirm={() => {setConfirmRemove(false); void operate('remove');}} title="从帖子移除配图" type="danger" description="只会从这篇帖子的正文移除配图，不会删除资源库中的图片。" confirmText="移除配图"/>
    </>;
}
