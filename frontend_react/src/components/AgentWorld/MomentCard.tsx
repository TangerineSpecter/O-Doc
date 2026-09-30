import {compactMomentText} from '../../utils/socialText';
import {socialTime} from '../../utils/socialTime';
import {useCallback, useEffect, useState} from 'react';
import {Heart, MessageCircle, Trash2} from 'lucide-react';
import type {Moment, MomentComment} from '../../types/api/social';
import {addMomentComment, deleteMoment, getMomentComments, likeMoment, regenerateMomentImage, recoverMomentImage} from '../../api/social';
import AuthenticatedResourceImage from '../common/AuthenticatedResourceImage';
import AgentAvatar from './AgentAvatar';
import {SocialDiscussion, type DiscussionEntry} from './SocialDiscussion';

export default function MomentCard({moment, onChanged, focused = false}: {moment: Moment; onChanged: () => void; focused?: boolean}) {
    const [open, setOpen] = useState(false);
    const [dismissedFocus, setDismissedFocus] = useState(false);
    const isOpen = open || (focused && !dismissedFocus);
    const [comments, setComments] = useState<MomentComment[]>([]);
    const [reply, setReply] = useState<DiscussionEntry | null>(null);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const reload = useCallback(async () => {setLoading(true); try {const result = await getMomentComments(moment.id); setComments(result.comments);}
        catch (e) {setError(e instanceof Error ? e.message : '讨论加载失败');} finally {setLoading(false);}}, [moment.id]);
    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        void getMomentComments(moment.id).then(r => {if (active) setComments(r.comments);}).catch(e => {if (active) setError(e instanceof Error ? e.message : '讨论加载失败');});
        return () => {active = false;};
    }, [isOpen, moment.id, moment.commentCount]);
    const mutate = async (operation: () => Promise<unknown>) => {
        if (busy) return; setBusy(true); setError('');
        try {await operation(); onChanged();} catch (e) {setError(e instanceof Error ? e.message : '操作失败');} finally {setBusy(false);}
    };
    return <article id={`moment-${moment.id}`} className={`rounded-2xl border bg-white p-5 shadow-sm ${focused ? 'border-orange-300' : 'border-slate-200'}`}>
        <div className="flex items-start gap-3 sm:gap-4"><AgentAvatar name={moment.identity.name || '世界居民'} avatar={moment.identity.avatar || moment.identity.name?.slice(0, 1) || '人'} size="md"/>
        <div className="min-w-0 flex-1"><header className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-slate-900">{moment.identity.name || '世界居民'}</h3></div>
            {moment.canDelete && <button aria-label="删除动态" type="button" disabled={busy} onClick={() => void mutate(() => deleteMoment(moment.id))} className="self-start rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5"/></button>}
        </header>
        <p className="mb-3 mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{compactMomentText(moment.content)}</p>
        {moment.images.length > 0 && <div className={`mb-4 grid gap-2 ${moment.images.length === 1 ? 'max-w-sm grid-cols-1' : 'grid-cols-3'}`}>{moment.images.map(id => <AuthenticatedResourceImage key={id} resourceId={id} alt={`${moment.identity.name}的生活配图`} className="aspect-square w-full rounded-xl" fitMode="contain-blur"/>)}</div>}
        {moment.imageState.status && moment.imageState.status !== 'succeeded' && <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
            {['pending', 'generating'].includes(moment.imageState.status) ? '配图正在准备，文字已发布。' : `配图未完成：${moment.imageState.error || '等待处理'}`}
            {moment.canRetryImage && ['failed', 'manual'].includes(moment.imageState.status) && <><button disabled={busy} type="button" onClick={() => void mutate(() => recoverMomentImage(moment.id))} className="ml-2 text-orange-600">查询原请求</button><button disabled={busy} type="button" onClick={() => void mutate(() => regenerateMomentImage(moment.id))} className="ml-2 text-orange-600">重新生成（新调用）</button></>}
        </div>}
        <div className="flex flex-wrap items-center gap-4 text-xs">
            <time dateTime={moment.createdAt} className="mr-auto text-[11px] text-slate-400">{socialTime(moment.createdAt)}</time>
            <button aria-label={`${moment.liked ? '取消点赞' : '点赞'}，${moment.likeCount}人`} type="button" disabled={busy} onClick={() => void mutate(() => likeMoment(moment.id, !moment.liked))} className={`flex items-center gap-1.5 ${moment.liked ? 'text-rose-500' : 'text-slate-500'}`}><Heart className={`h-4 w-4 ${moment.liked ? 'fill-current' : ''}`}/>{moment.likeCount || '点赞'}</button>
            <button aria-label={`查看评论，${moment.commentCount}条`} type="button" onClick={() => {setOpen(!isOpen); setDismissedFocus(true);}} className="flex items-center gap-1.5 text-slate-500"><MessageCircle className="h-4 w-4"/>{moment.commentCount || '评论'}</button>
        </div>
        {!!moment.likedBy?.length && <p className="mt-3 flex items-start gap-2 rounded-xl bg-orange-50/50 px-3 py-2 text-xs leading-5 text-slate-500"><Heart className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400"/><span>{moment.likedBy.map(p => p.identity.name || '参与者').join('、')} 赞了这条动态</span></p>}
        {isOpen && <div className="mt-3 border-t border-slate-100 pt-2">
            {loading && <p className="text-xs text-slate-400">读取讨论中…</p>}
            <SocialDiscussion entries={comments.map(c => ({...c, name: c.identity.name, avatar: c.identity.avatar}))} onReply={setReply}/>
            {reply && <p className="mt-2 text-xs text-orange-600">回复 {reply.name}<button type="button" onClick={() => setReply(null)} className="ml-2 text-slate-400">取消</button></p>}
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={2} maxLength={1000} placeholder="说说你的想法…" className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-orange-300"/>
            <button type="button" disabled={busy || !draft.trim()} onClick={() => void mutate(async () => {await addMomentComment(moment.id, draft.trim(), reply?.id, reply?.actorId); setDraft(''); setReply(null); await reload();})} className="mt-2 rounded-lg bg-orange-500 px-3 py-1.5 text-xs text-white disabled:opacity-50">发表评论</button>
        </div>}
        {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div></div>
    </article>;
}
