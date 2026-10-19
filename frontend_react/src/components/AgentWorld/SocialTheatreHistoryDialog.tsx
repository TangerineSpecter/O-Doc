import {useEffect, useRef, useState} from 'react';
import {ExternalLink, MessagesSquare, Newspaper, Play, RotateCcw, Trash2} from 'lucide-react';
import {deleteSocialTheatreEvent, getSocialTheatreEvent, getSocialTheatreEvents, triggerSocialTheatre, resumeSocialTheatre} from '../../api/social';
import type {SocialTheatreEvent} from '../../types/api/social';
import ConfirmationModal from '../common/ConfirmationModal';
import WorldDialog from './WorldDialog';
import AgentAvatar from './AgentAvatar';
import SocialTheatreRelationChanges from './SocialTheatreRelationChanges';

const statusText: Record<SocialTheatreEvent['status'], string> = {
    scheduled: '等待调度', searching: '正在找新闻', running: '讨论中', completed: '已完成',
    skipped: '已结束', failed: '暂时中断', expired: '已结束',
};
const activeStatuses = new Set<SocialTheatreEvent['status']>(['scheduled', 'searching', 'running']);
const emptyAttempt = (event: SocialTheatreEvent) => !activeStatuses.has(event.status)
    && !(event.messageCount ?? event.transcript?.length ?? 0);

function timeLabel(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
}

export default function SocialTheatreHistoryDialog({onClose, onRelationsChanged, initialEventId}: {
    onClose: () => void;
    onRelationsChanged?: () => void;
    initialEventId?: string;
}) {
    const [items, setItems] = useState<SocialTheatreEvent[]>([]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [selected, setSelected] = useState<SocialTheatreEvent | null>(null);
    const [busy, setBusy] = useState(true);
    const [triggering, setTriggering] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const detailRequest = useRef(0);
    useEffect(() => () => {detailRequest.current += 1;}, []);
    const onRelationsChangedRef = useRef(onRelationsChanged);
    useEffect(() => {onRelationsChangedRef.current = onRelationsChanged;}, [onRelationsChanged]);
    useEffect(() => {
        if (!initialEventId) return;
        let active = true;
        const request = ++detailRequest.current;
        void getSocialTheatreEvent(initialEventId).then(event => {
            if (active && request === detailRequest.current) setSelected(event);
        }).catch(reason => {
            if (active && request === detailRequest.current) setError(reason instanceof Error ? reason.message : '讨论详情加载失败');
        });
        return () => {active = false;};
    }, [initialEventId]);

    const loadPage = async (cursor?: string) => {
        setBusy(true);
        setError('');
        try {
            const result = await getSocialTheatreEvents(cursor);
            setItems(previous => cursor ? [...previous, ...result.items] : result.items);
            setNextCursor(result.nextCursor);
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '小剧场记录加载失败');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        let active = true;
        void getSocialTheatreEvents().then(result => {
            if (!active) return;
            setItems(result.items);
            setNextCursor(result.nextCursor);
        }).catch(reason => {
            if (active) setError(reason instanceof Error ? reason.message : '小剧场记录加载失败');
        }).finally(() => {
            if (active) setBusy(false);
        });
        return () => {active = false;};
    }, []);

    const pollingId = selected && activeStatuses.has(selected.status) ? selected.id : '';
    useEffect(() => {
        if (!pollingId) return;
        let active = true;
        let fetching = false;
        const refreshTriggeredEvent = async () => {
            if (fetching) return;
            fetching = true;
            try {
                const latest = await getSocialTheatreEvent(pollingId);
                if (!active) return;
                const hidden = emptyAttempt(latest);
                setSelected(current => current?.id === pollingId ? (hidden ? null : latest) : current);
                if (hidden) setNotice(latest.status === 'failed'
                    ? '本次讨论暂未开始，可稍后重新发起。活动流已保留简短记录。'
                    : '本次没有形成讨论，活动流已保留简短记录。');
                if (!activeStatuses.has(latest.status)) onRelationsChangedRef.current?.();
                setItems(previous => {
                    if (hidden) return previous.filter(item => item.id !== latest.id);
                    const next = previous.some(item => item.id === latest.id)
                        ? previous.map(item => item.id === latest.id ? latest : item)
                        : [latest, ...previous];
                    return next.sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt));
                });
            } catch (reason) {
                if (active) setError(reason instanceof Error ? reason.message : '小剧场状态刷新失败');
            } finally {
                fetching = false;
            }
        };
        const timer = window.setInterval(() => {void refreshTriggeredEvent();}, 5000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, [pollingId]);

    const trigger = async () => {
        const request = ++detailRequest.current;
        setTriggering(true);
        setError('');
        setNotice('');
        try {
            const result = await triggerSocialTheatre();
            if (request === detailRequest.current) setSelected(result.event);
            setItems(previous => {
                const next = [...previous.filter(item => item.id !== result.event.id), result.event];
                return next.sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt));
            });
            setNotice('已加入调度队列，开始后会自动刷新这场讨论。');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '手动触发失败');
        } finally {
            setTriggering(false);
        }
    };

    const openEvent = async (item: SocialTheatreEvent) => {
        const request = ++detailRequest.current;
        setNotice('');
        setError('');
        setSelected(item);
        try {
            const event = await getSocialTheatreEvent(item.id);
            if (request === detailRequest.current) setSelected(event);
        } catch (reason) {
            if (request === detailRequest.current) setError(reason instanceof Error ? reason.message : '讨论详情加载失败');
        }
    };

    const resume = async () => {
        if (!selected || triggering) return;
        const request = ++detailRequest.current;
        setTriggering(true);
        setError('');
        try {
            const result = await resumeSocialTheatre(selected.id);
            if (request === detailRequest.current) setSelected(result.event);
            setItems(previous => [result.event, ...previous.filter(item => item.id !== result.event.id)]);
            setNotice('已安排继续这场讨论，之前的发言会保留。');
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : '暂时无法继续讨论');
        } finally {
            setTriggering(false);
        }
    };

    const deleteSelected = async () => {
        const target = selected;
        if (!target || activeStatuses.has(target.status) || deleting) return;
        setDeleting(true);
        setError('');
        try {
            await deleteSocialTheatreEvent(target.id);
            setItems(previous => previous.filter(item => item.id !== target.id));
            setSelected(current => current?.id === target.id ? null : current);
            setConfirmDelete(false);
            setNotice('记录已删除，该场关系影响已撤销，其他互动的影响已保留。');
            onRelationsChanged?.();
        } catch (reason) {
            setConfirmDelete(false);
            setError(reason instanceof Error ? reason.message : '删除小剧场记录失败');
        } finally {
            setDeleting(false);
        }
    };

    return <WorldDialog title="小剧场记录" description="查看新闻主题、参与居民和完整群聊内容。" size="wide" fixedHeight onClose={onClose}>
        <div className="flex h-[min(70vh,680px)] min-h-0 flex-col gap-3 lg:flex-row">
            <aside className="flex min-h-0 w-full flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-3 lg:w-[34%] lg:shrink-0">
                <div className="mb-2 flex items-center justify-between gap-2"><h3 className="shrink-0 text-xs font-bold text-slate-700">最近场次</h3><div className="flex items-center gap-1"><button type="button" onClick={() => void trigger()} disabled={busy || triggering} className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-50"><Play className="h-3 w-3 fill-current"/>{triggering ? '提交中…' : '手动触发'}</button><button type="button" aria-label="刷新记录" onClick={() => void loadPage()} disabled={busy} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-orange-600 disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5"/></button></div></div>
                {notice && <p role="status" className="mb-2 rounded-lg bg-orange-50 px-2.5 py-2 text-[10px] leading-4 text-orange-700">{notice}</p>}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scrollbar-hide">
                    {items.map(item => <button key={item.id} type="button" onClick={() => void openEvent(item)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.id === item.id ? 'border-orange-200 bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-200'}`}>
                        <div className="flex items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{timeLabel(item.scheduledAt)}</span><span className="flex items-center gap-1.5">{item.manual && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] text-orange-700">手动</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] ${item.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : item.status === 'failed' || item.status === 'skipped' ? 'bg-slate-100 text-slate-500' : 'bg-orange-50 text-orange-700'}`}>{statusText[item.status]}</span></span></div>
                        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-800">{item.topic?.title || item.source.title || '正在准备讨论话题'}</p>
                        {item.participants.length > 0 && <p className="mt-1 truncate text-[10px] text-slate-400">{item.participants.map(person => person.name).join('、')}</p>}
                    </button>)}
                    {!items.length && !busy && <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">还没有小剧场记录</p>}
                    {nextCursor && <button type="button" disabled={busy} onClick={() => void loadPage(nextCursor)} className="w-full rounded-xl py-2 text-xs text-orange-600 disabled:opacity-40">{busy ? '读取中…' : '加载更早记录'}</button>}
                </div>
            </aside>
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {error && <p role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{error}</p>}
                {!selected ? <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center text-slate-400"><MessagesSquare className="mb-3 h-7 w-7 text-orange-300"/><p className="text-sm font-medium text-slate-600">选择一场讨论</p><p className="mt-1 text-xs">新闻来源链接只在这里展示，不会发给参与讨论的居民。</p></div> : <>
                    <div className="border-b border-slate-100 p-4">
                        <div className="flex items-start gap-2"><Newspaper className="mt-0.5 h-4 w-4 shrink-0 text-orange-500"/><div className="min-w-0 flex-1"><h3 className="text-sm font-bold leading-6 text-slate-800">{selected.topic?.title || selected.source.title || '未生成新闻主题'}</h3>
                            {selected.source.summary ? <details key={selected.id} open={!selected.topic} className="mt-1 text-xs text-slate-600">
                                <summary className="cursor-pointer text-[11px] text-slate-400">搜索返回的新闻片段（展开后可滚动）</summary>
                                {selected.topic?.title && <p className="mt-2 text-[11px] leading-5 text-slate-400">原标题：{selected.source.title}</p>}
                                <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap break-words leading-5 scrollbar-hide">{selected.source.summary}</p>
                            </details> : <p className="mt-1 text-xs leading-5 text-slate-500">{selected.status === 'failed' ? '讨论尚未准备完成，可以稍后继续。' : selected.error || '本场没有可展示的新闻摘要。'}</p>}
                        </div>{!activeStatuses.has(selected.status) && <button type="button" onClick={() => setConfirmDelete(true)} disabled={deleting} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-[10px] font-medium text-red-600 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50" aria-label="删除小剧场记录"><Trash2 className="h-3 w-3"/>删除记录</button>}</div>
                        {selected.topic && <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2">
                            <p className="text-[10px] font-medium text-orange-600">讨论议题</p>
                            <p className="text-xs font-semibold leading-5 text-slate-700">{selected.topic.question}</p>
                            <p className="mt-2 text-[10px] font-medium text-slate-400">内容总结</p>
                            <p className="mt-1 text-[11px] leading-5 text-slate-500">{selected.topic.event}</p>
                        </div>}
                        {selected.status === 'failed' && <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-700">
                            <p>本场讨论暂时中断，已保存的发言会保留。</p>
                            <button type="button" disabled={triggering} onClick={() => void resume()} className="rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-white disabled:opacity-50">{triggering ? '提交中…' : '继续讨论'}</button>
                        </div>}
                        {selected.status === 'searching' && <p role="status" className="mt-3 text-xs text-slate-500">正在寻找适合讨论的新闻。</p>}
                        {selected.status === 'running' && <p role="status" className="mt-3 text-xs text-orange-700">{selected.topic
                            ? `${selected.participants.map(person => person.name).join('、')}正在热议【${selected.topic.title || selected.source.title}】`
                            : '正在准备讨论话题。'}</p>}
                        {selected.status === 'scheduled' && <p role="status" className="mt-3 rounded-xl border border-orange-100 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-700">
                            {selected.error || (selected.manual ? '已提交后台，等待检索新闻与分配居民。' : '尚未到自动安排的开始时间。')}
                            {selected.error && <> 下次尝试：{timeLabel(selected.scheduledAt)}。</>}
                            {' '}本页每5秒自动更新状态。
                        </p>}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-400">{selected.participants.map(person => person.name).join('、') || '未选出参与居民'} · {statusText[selected.status]}</p>{selected.source.url && <a href={selected.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-medium text-orange-700 hover:bg-orange-50">查看新闻来源<ExternalLink className="h-3 w-3"/></a>}</div>
                    </div>
                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 scrollbar-hide">
                        {selected.transcript?.map((turn, index) => <article key={`${turn.round}-${turn.speakerId}-${index}`} className="flex items-start gap-2.5">
                            <AgentAvatar name={turn.name} avatar={turn.avatar} size="sm"/>
                            <div className="min-w-0 max-w-[90%]"><div className="mb-1"><span className="text-[11px] font-semibold text-slate-700">{turn.name}</span></div><p className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700 shadow-sm">{turn.content}</p></div>
                        </article>)}
                        {selected.status === 'running' && <p className="text-center text-[11px] text-slate-400">讨论仍在进行，稍后刷新可查看新发言。</p>}
                        {!selected.transcript?.length && selected.status !== 'running' && <p className="py-10 text-center text-xs text-slate-400">{selected.status === 'completed' ? '大家这次没有继续聊。' : '这场讨论没有保存发言。'}</p>}
                        {selected.status === 'completed' && <SocialTheatreRelationChanges changes={selected.relationChanges || []}/>}
                    </div>
                </>}
            </section>
        </div>
        <ConfirmationModal isOpen={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={() => void deleteSelected()} title="删除这条小剧场记录？" description="删除记录并撤销本场对好感、熟悉度和情绪的影响，保留其他互动的效果。删除状态与恢复后的关系会通过 WebDAV 同步。" confirmText="删除并撤销影响" type="danger" isLoading={deleting}/>
    </WorldDialog>;
}
