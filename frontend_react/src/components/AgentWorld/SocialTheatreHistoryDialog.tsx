import {useEffect, useRef, useState} from 'react';
import {ArrowLeft, Calendar, ChevronDown, ChevronRight, ExternalLink, FileText, HelpCircle, MessageCircle, MessagesSquare, Newspaper, Play, RotateCcw, Sparkles, Trash2} from 'lucide-react';
import {deleteSocialTheatreEvent, getSocialTheatreEvent, getSocialTheatreEvents, triggerSocialTheatre, resumeSocialTheatre} from '../../api/social';
import type {SocialTheatreEvent} from '../../types/api/social';
import ConfirmationModal from '../common/ConfirmationModal';
import WorldDialog from './WorldDialog';
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

function formatTurnTime(value?: string) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-CN', {month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false});
}

const AVATAR_PALETTES = [
    {bg: 'bg-orange-100 text-orange-700 border-orange-200'},
    {bg: 'bg-emerald-100 text-emerald-700 border-emerald-200'},
    {bg: 'bg-sky-100 text-sky-700 border-sky-200'},
    {bg: 'bg-purple-100 text-purple-700 border-purple-200'},
    {bg: 'bg-rose-100 text-rose-700 border-rose-200'},
    {bg: 'bg-amber-100 text-amber-700 border-amber-200'},
    {bg: 'bg-teal-100 text-teal-700 border-teal-200'},
    {bg: 'bg-indigo-100 text-indigo-700 border-indigo-200'},
];

function getResidentColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function ResidentAvatar({name, avatar, size = 'sm'}: {name: string; avatar?: string; size?: 'xs' | 'sm' | 'md'}) {
    const [failed, setFailed] = useState(false);
    const isImage = Boolean(avatar && /^(https?:|data:|\/)/.test(avatar));
    const palette = getResidentColor(name);
    const initial = name ? name.trim().charAt(0) : '?';

    const sizeMap = {
        xs: 'h-5 w-5 text-[10px]',
        sm: 'h-8 w-8 text-xs font-bold',
        md: 'h-10 w-10 text-sm font-bold',
    };

    if (isImage && !failed) {
        return (
            <img
                src={avatar}
                alt={name}
                onError={() => setFailed(true)}
                className={`${sizeMap[size]} shrink-0 rounded-full object-cover ring-2 ring-white shadow-2xs`}
            />
        );
    }

    if (avatar && !isImage) {
        return (
            <span className={`${sizeMap[size]} shrink-0 inline-flex items-center justify-center rounded-full bg-orange-50 text-orange-700 ring-2 ring-white shadow-2xs`}>
                {avatar}
            </span>
        );
    }

    return (
        <span className={`${sizeMap[size]} shrink-0 inline-flex items-center justify-center rounded-full border ${palette.bg} select-none ring-2 ring-white shadow-2xs`}>
            {initial}
        </span>
    );
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

    const activeTabRef = useRef<HTMLButtonElement | null>(null);
    const detailRequest = useRef(0);
    useEffect(() => () => {detailRequest.current += 1;}, []);
    const onRelationsChangedRef = useRef(onRelationsChanged);
    useEffect(() => {onRelationsChangedRef.current = onRelationsChanged;}, [onRelationsChanged]);

    const selectedId = selected?.id;
    // 选中项变化时横向滚动居中选中的标签
    useEffect(() => {
        if (selectedId && activeTabRef.current) {
            activeTabRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center',
            });
        }
    }, [selectedId]);

    useEffect(() => {
        if (!initialEventId) return;
        let active = true;
        const request = ++detailRequest.current;
        void getSocialTheatreEvent(initialEventId).then(event => {
            if (active && request === detailRequest.current) {
                setSelected(event);
            }
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
                if (hidden) {
                    setNotice(latest.status === 'failed'
                        ? '本次讨论暂未开始，可稍后重新发起。活动流已保留简短记录。'
                        : '本次没有形成讨论，活动流已保留简短记录。');
                }
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
            if (request === detailRequest.current) {
                setSelected(result.event);
            }
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
        <div className="relative flex h-[min(70vh,680px)] min-h-0 w-full flex-col overflow-hidden">
            {error && <p role="alert" className="mb-2 shrink-0 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
            {notice && <p role="status" className="mb-2 shrink-0 rounded-xl border border-orange-200 bg-orange-50 p-2.5 text-xs text-orange-700">{notice}</p>}

            {!selected ? (
                /* 开始的展示：场次列表网格 */
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="mb-3.5 flex shrink-0 flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-800">最近场次</h3>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                                共 {items.length} 场
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void trigger()}
                                disabled={busy || triggering}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs transition-all hover:bg-orange-600 active:scale-95 disabled:cursor-wait disabled:opacity-50"
                            >
                                <Play className="h-3.5 w-3.5 fill-current" />
                                {triggering ? '提交中…' : '手动触发'}
                            </button>
                            <button
                                type="button"
                                aria-label="刷新记录"
                                onClick={() => void loadPage()}
                                disabled={busy}
                                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-all hover:border-orange-200 hover:text-orange-600 active:scale-95 disabled:opacity-40"
                            >
                                <RotateCcw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide p-1 pt-2 pb-4">
                        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map(item => {
                                const isCompleted = item.status === 'completed';
                                const isRunning = item.status === 'running';
                                const isWaiting = item.status === 'searching' || item.status === 'scheduled';
                                const messageTotal = item.messageCount ?? item.transcript?.length ?? 0;

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => void openEvent(item)}
                                        className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-2xs transition-all duration-200 hover:border-orange-300 hover:bg-gradient-to-b hover:from-white hover:to-orange-50/20 hover:shadow-md hover:shadow-orange-500/8 cursor-pointer"
                                    >
                                        <div>
                                            {/* 顶部时间与状态徽章 */}
                                            <div className="mb-2.5 flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                                                    <Calendar className="h-3 w-3 text-slate-400" />
                                                    <span>{timeLabel(item.scheduledAt)}</span>
                                                    {item.manual && (
                                                        <span className="rounded-md border border-orange-200/80 bg-orange-50 px-1.5 py-0.2 text-[9px] font-semibold text-orange-600">
                                                            手动
                                                        </span>
                                                    )}
                                                </div>

                                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                                                    isCompleted
                                                        ? 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
                                                        : isRunning
                                                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                                                        : isWaiting
                                                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                        : 'border-slate-200 bg-slate-100 text-slate-500'
                                                }`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${
                                                        isCompleted
                                                            ? 'bg-emerald-500'
                                                            : isRunning
                                                            ? 'bg-orange-500 animate-pulse'
                                                            : isWaiting
                                                            ? 'bg-blue-500'
                                                            : 'bg-slate-400'
                                                    }`} />
                                                    {statusText[item.status]}
                                                </span>
                                            </div>

                                            {/* 话题主标题 */}
                                            <h4 className="line-clamp-2 text-sm font-bold leading-snug text-slate-800 transition-colors group-hover:text-orange-600">
                                                {item.topic?.title || item.source.title || '正在准备讨论话题'}
                                            </h4>

                                            {/* 议题便签卡 */}
                                            {item.topic?.question && (
                                                <div className="mt-2.5 rounded-xl border border-orange-100/80 bg-gradient-to-r from-orange-50/60 to-amber-50/40 p-2.5 transition-colors group-hover:border-orange-200">
                                                    <div className="flex items-start gap-1.5">
                                                        <span className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded bg-orange-500/10 px-1.5 py-0.2 text-[9px] font-bold text-orange-700">
                                                            议题
                                                        </span>
                                                        <p className="line-clamp-2 text-xs font-medium leading-relaxed text-slate-700">
                                                            {item.topic.question}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* 底部参与居民头像组与发言数 */}
                                        <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">
                                            <div className="flex min-w-0 items-center gap-1.5 mr-2">
                                                {item.participants.length > 0 && (
                                                    <div className="flex -space-x-1.5 overflow-hidden shrink-0">
                                                        {item.participants.slice(0, 3).map((p, idx) => (
                                                            <ResidentAvatar key={p.id || idx} name={p.name} avatar={p.avatar} size="xs" />
                                                        ))}
                                                        {item.participants.length > 3 && (
                                                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[8px] font-bold text-slate-600 ring-2 ring-white">
                                                                +{item.participants.length - 3}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                                <span className="truncate text-xs font-medium text-slate-500 transition-colors group-hover:text-slate-700">
                                                    {item.participants.length > 0
                                                        ? item.participants.map(p => p.name).join('、')
                                                        : '未分配居民'}
                                                </span>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-1 font-medium text-slate-400 transition-colors group-hover:text-orange-600">
                                                <MessageCircle className="h-3.5 w-3.5 text-slate-400 transition-colors group-hover:text-orange-500" />
                                                <span>{messageTotal} 条</span>
                                                <ChevronRight className="h-3.5 w-3.5 text-slate-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-orange-500" />
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {!items.length && !busy && (
                            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center">
                                <MessagesSquare className="mb-2 h-8 w-8 text-slate-300" />
                                <p className="text-sm font-medium text-slate-500">还没有小剧场记录</p>
                                <p className="mt-1 text-xs text-slate-400">点击右上角“手动触发”可发起一场新的小剧场讨论</p>
                            </div>
                        )}

                        {nextCursor && (
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void loadPage(nextCursor)}
                                className="mt-3.5 w-full rounded-xl border border-slate-200 bg-white py-2 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50 disabled:opacity-40"
                            >
                                {busy ? '读取中…' : '加载更早记录'}
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                /* 场次详情：顶部横向切换 + 左侧议题信息 + 右侧对话内容 */
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {/* 顶部场次横向滚动切换条 */}
                    <div className="mb-3 flex shrink-0 items-center gap-2 border-b border-slate-200/80 pb-2.5">
                        <button
                            type="button"
                            onClick={() => setSelected(null)}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 active:scale-95"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            <span>返回</span>
                        </button>

                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-hide py-1">
                            {items.map(item => {
                                const isCurrent = selected.id === item.id;
                                const isCompleted = item.status === 'completed';
                                const isRunning = item.status === 'running';

                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        ref={isCurrent ? activeTabRef : null}
                                        onClick={() => void openEvent(item)}
                                        className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition-all ${
                                            isCurrent
                                                ? 'border-orange-300 bg-orange-50/90 font-semibold text-orange-900 shadow-2xs ring-1 ring-orange-200'
                                                : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="shrink-0 text-[10px] font-normal text-slate-400">
                                            {timeLabel(item.scheduledAt)}
                                        </span>
                                        <span className="max-w-[130px] truncate sm:max-w-[170px]">
                                            {item.topic?.title || item.source.title || '讨论话题'}
                                        </span>
                                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.2 text-[9px] font-normal ${
                                            isCompleted
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : isRunning
                                                ? 'bg-orange-100 text-orange-700'
                                                : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            <span className={`h-1 w-1 rounded-full ${
                                                isCompleted ? 'bg-emerald-500' : isRunning ? 'bg-orange-500' : 'bg-slate-400'
                                            }`} />
                                            {statusText[item.status]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                            <button
                                type="button"
                                aria-label="刷新记录"
                                onClick={() => void loadPage()}
                                disabled={busy}
                                className="rounded-xl border border-slate-200 bg-white p-1.5 text-slate-400 transition-colors hover:border-orange-200 hover:text-orange-600 disabled:opacity-40"
                            >
                                <RotateCcw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    </div>

                    {/* 下方分栏展示：左侧议题信息，右侧对话内容 */}
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
                        {/* 左侧：议题信息 */}
                        <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs lg:w-[42%] lg:shrink-0">
                            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shadow-2xs">
                                        <Newspaper className="h-3.5 w-3.5" />
                                    </span>
                                    <h4 className="text-xs font-bold text-slate-800">议题信息</h4>
                                </div>
                                {!activeStatuses.has(selected.status) && (
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDelete(true)}
                                        disabled={deleting}
                                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50"
                                        aria-label="删除小剧场记录"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                        <span>删除记录</span>
                                    </button>
                                )}
                            </div>

                            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4 scrollbar-hide">
                                <div className="space-y-2.5">
                                    <h3 className="text-base font-extrabold leading-snug tracking-tight text-slate-900">
                                        {selected.topic?.title || selected.source.title || '未生成新闻主题'}
                                    </h3>
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-1.5 overflow-hidden">
                                                {selected.participants.map((person, idx) => (
                                                    <ResidentAvatar key={person.id || idx} name={person.name} avatar={person.avatar} size="xs" />
                                                ))}
                                            </div>
                                            <span className="text-xs font-medium text-slate-600">
                                                {selected.participants.map(p => p.name).join('、') || '未选出居民'}
                                            </span>
                                        </div>

                                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${
                                            selected.status === 'completed'
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                : selected.status === 'running'
                                                ? 'border-orange-200 bg-orange-50 text-orange-700'
                                                : 'border-slate-200 bg-slate-100 text-slate-500'
                                        }`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${
                                                selected.status === 'completed' ? 'bg-emerald-500' : selected.status === 'running' ? 'bg-orange-500 animate-pulse' : 'bg-slate-400'
                                            }`} />
                                            {statusText[selected.status]}
                                        </span>
                                    </div>
                                </div>

                                {/* 讨论议题卡 */}
                                {selected.topic && (
                                    <div className="overflow-hidden rounded-2xl border border-orange-200/80 bg-gradient-to-br from-orange-50/70 via-white to-amber-50/30 p-3.5 shadow-2xs">
                                        <div className="flex items-center gap-1.5">
                                            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500 text-white shadow-2xs">
                                                <HelpCircle className="h-3 w-3" />
                                            </span>
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
                                                讨论议题
                                            </span>
                                        </div>
                                        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-800">
                                            {selected.topic.question}
                                        </p>

                                        <div className="mt-3 rounded-xl border border-orange-100/80 bg-white/90 p-2.5 shadow-2xs">
                                            <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                                                <Sparkles className="h-3 w-3 text-amber-500" />
                                                <span>内容总结</span>
                                            </div>
                                            <p className="mt-1 text-xs leading-relaxed text-slate-600 font-medium">
                                                {selected.topic.event}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* 新闻片段手风琴折叠 */}
                                {selected.source.summary ? (
                                    <details key={selected.id} open={!selected.topic} className="group rounded-2xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs transition-all">
                                        <summary className="flex cursor-pointer select-none items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-800">
                                            <div className="flex items-center gap-1.5">
                                                <FileText className="h-3.5 w-3.5 text-slate-400" />
                                                <span>搜索返回的新闻片段（展开后可滚动）</span>
                                            </div>
                                            <span className="text-slate-400 transition-transform group-open:rotate-180">
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            </span>
                                        </summary>
                                        <div className="mt-2.5 border-t border-slate-200/60 pt-2.5 text-slate-600">
                                            {selected.topic?.title && (
                                                <p className="text-[11px] font-medium text-slate-400">原标题：{selected.source.title}</p>
                                            )}
                                            <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-100 bg-white/80 p-2.5 text-xs leading-relaxed text-slate-600 scrollbar-hide">
                                                {selected.source.summary}
                                            </p>
                                            {selected.source.url && (
                                                <div className="mt-2 text-right">
                                                    <a
                                                        href={selected.source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 hover:underline"
                                                    >
                                                        查看新闻来源
                                                        <ExternalLink className="h-2.5 w-2.5" />
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </details>
                                ) : (
                                    <p className="rounded-2xl border border-dashed border-slate-200 p-3.5 text-center text-xs leading-5 text-slate-400">
                                        {selected.status === 'failed' ? '讨论尚未准备完成，可以稍后继续。' : selected.error || '本场没有可展示的新闻摘要。'}
                                    </p>
                                )}

                                {selected.status === 'failed' && (
                                    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-700">
                                        <p>本场讨论暂时中断，已保存的发言会保留。</p>
                                        <button
                                            type="button"
                                            disabled={triggering}
                                            onClick={() => void resume()}
                                            className="rounded-lg bg-orange-500 px-3 py-1.5 font-semibold text-white shadow-2xs transition-colors hover:bg-orange-600 disabled:opacity-50"
                                        >
                                            {triggering ? '提交中…' : '继续讨论'}
                                        </button>
                                    </div>
                                )}
                                {selected.status === 'searching' && (
                                    <p role="status" className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                                        正在寻找适合讨论的新闻。
                                    </p>
                                )}
                                {selected.status === 'running' && (
                                    <p role="status" className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs text-orange-700">
                                        {selected.topic
                                            ? `${selected.participants.map(person => person.name).join('、')}正在热议【${selected.topic.title || selected.source.title}】`
                                            : '正在准备讨论话题。'}
                                    </p>
                                )}
                                {selected.status === 'scheduled' && (
                                    <p role="status" className="rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-700">
                                        {selected.error || (selected.manual ? '已提交后台，等待检索新闻与分配居民。' : '尚未到自动安排的开始时间。')}
                                        {selected.error && <> 下次尝试：{timeLabel(selected.scheduledAt)}。</>}
                                        {' '}本页每5秒自动更新状态。
                                    </p>
                                )}

                                {selected.status === 'completed' && (
                                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-400">
                                        💡 群聊讨论由居民自主决策与即兴互动产生，关系变化在讨论结束后生效。
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 右侧：对话内容 */}
                        <div className="flex h-full w-full flex-1 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-orange-100 text-orange-600 shadow-2xs">
                                        <MessagesSquare className="h-3.5 w-3.5" />
                                    </span>
                                    <h4 className="text-xs font-bold text-slate-800">对话内容</h4>
                                </div>
                                {selected.transcript && (
                                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                                        共 {selected.transcript.length} 条发言
                                    </span>
                                )}
                            </div>

                            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-4 scrollbar-hide">
                                {selected.transcript?.map((turn, index) => {
                                    const turnTime = formatTurnTime(turn.createdAt || (turn as {created_at?: string}).created_at);
                                    return (
                                        <article key={`${turn.round}-${turn.speakerId}-${index}`} className="flex items-start gap-3">
                                            <ResidentAvatar name={turn.name} avatar={turn.avatar} size="sm" />
                                            <div className="min-w-0 max-w-[85%]">
                                                <div className="mb-1 flex items-center gap-2">
                                                    <span className="text-xs font-bold text-slate-800">{turn.name}</span>
                                                    {turnTime && (
                                                        <time dateTime={turn.createdAt || (turn as {created_at?: string}).created_at} className="text-[10px] text-slate-400">
                                                            {turnTime}
                                                        </time>
                                                    )}
                                                </div>
                                                <div className="inline-block rounded-2xl rounded-tl-sm border border-slate-200/80 bg-white px-4 py-2.5 shadow-2xs transition-colors hover:border-orange-200">
                                                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-800">
                                                        {turn.content}
                                                    </p>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}

                                {selected.status === 'running' && (
                                    <p className="py-2 text-center text-[11px] text-slate-400">
                                        讨论仍在进行，稍后刷新可查看新发言。
                                    </p>
                                )}

                                {!selected.transcript?.length && selected.status !== 'running' && (
                                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                                        <MessagesSquare className="mb-2 h-7 w-7 text-slate-300" />
                                        <p className="text-xs">
                                            {selected.status === 'completed' ? '大家这次没有继续聊。' : '这场讨论没有保存发言。'}
                                        </p>
                                    </div>
                                )}

                                {selected.status === 'completed' && (
                                    <div className="pt-2">
                                        <SocialTheatreRelationChanges changes={selected.relationChanges || []} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        <ConfirmationModal
            isOpen={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => void deleteSelected()}
            title="删除这条小剧场记录？"
            description="删除记录并撤销本场对好感、熟悉度和情绪的影响，保留其他互动的效果。删除状态与恢复后的关系会通过 WebDAV 同步。"
            confirmText="删除并撤销影响"
            type="danger"
            isLoading={deleting}
        />
    </WorldDialog>;
}
