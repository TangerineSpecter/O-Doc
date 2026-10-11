import ConfirmationModal from '@/components/common/ConfirmationModal';
import {useState} from 'react';
import {usePostPhoto} from '@/hooks/usePostPhoto';

export function PostPhotoStatus({postId, onInserted}: {postId: string; onInserted: () => void}) {
    const {state, error, busy, operate} = usePostPhoto(postId, onInserted);
    const [confirmRetry, setConfirmRetry] = useState(false);
    if (!state.status || state.status === 'inserted' || state.status === 'abandoned') return null;
    const pending = ['pending', 'generating'].includes(state.status);
    const retryable = ['failed', 'cancelled'].includes(state.status);
    return <aside className="mx-6 mb-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:mx-10">
        <p className="text-slate-600">{pending ? '帖子配图正在生成，完成后会自动显示。' : state.error || '配图需要确认原请求结果。'}</p>
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {!pending && state.canManage && <div className="flex flex-wrap gap-3 text-xs">
            {state.status === 'manual' ? <button type="button" disabled={busy} onClick={() => void operate('use_image')} className="text-orange-600">将已生成图片插入正文</button> : <button type="button" disabled={busy} onClick={() => void operate('query')} className="text-orange-600">查询原请求</button>}
            {retryable && <button type="button" disabled={busy} onClick={() => setConfirmRetry(true)} className="text-orange-600">重新生成</button>}
        </div>}
        {state.status === 'manual' && state.imageUrl && <img src={state.imageUrl} alt="待插入的帖子配图" className="max-h-64 rounded-xl object-contain"/>}
        <ConfirmationModal isOpen={confirmRetry} onClose={() => setConfirmRetry(false)} onConfirm={() => {setConfirmRetry(false); void operate('retry');}} title="重新生成配图" type="warning" description="重新生成一张配图可能产生费用，是否继续？" confirmText="确认生成"/>
    </aside>;
}
