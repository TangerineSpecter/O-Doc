import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Archive, Bell, Check, CheckCircle2, ExternalLink, Info, AlertTriangle, Inbox, Loader2, RotateCcw, Trash2, XCircle } from 'lucide-react';
import {
    clearNotificationTrash,
    deleteNotification,
    deleteNotificationPermanently,
    getNotifications,
    markAllRead,
    markRead,
    NotificationItem,
    NotificationStatus,
    restoreNotification
} from '../api/message';

interface NotificationPopoverProps {
    isAuthenticated: boolean;
    onClose: () => void;
    onNavigate?: (viewName: string, params?: any) => void;
    onUnreadChange?: (count: number) => void;
}

export default function NotificationPopover({ isAuthenticated, onClose, onNavigate, onUnreadChange }: NotificationPopoverProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [historyNotifications, setHistoryNotifications] = useState<NotificationItem[]>([]);
    const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyStatus, setHistoryStatus] = useState<NotificationStatus>('all');
    const [deleting, setDeleting] = useState(false);
    const [tearing, setTearing] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const getTone = (type: NotificationItem['type']) => {
        switch (type) {
            case 'success':
                return {
                    label: 'DONE',
                    iconBox: 'bg-lime-500',
                    tag: 'bg-lime-100 text-lime-800',
                    accent: 'bg-lime-400',
                    text: 'text-lime-700',
                };
            case 'warning':
                return {
                    label: 'WATCH',
                    iconBox: 'bg-amber-400',
                    tag: 'bg-amber-100 text-amber-800',
                    accent: 'bg-amber-300',
                    text: 'text-amber-700',
                };
            case 'error':
                return {
                    label: 'ALERT',
                    iconBox: 'bg-rose-500',
                    tag: 'bg-rose-100 text-rose-800',
                    accent: 'bg-rose-300',
                    text: 'text-rose-700',
                };
            default:
                return {
                    label: 'INFO',
                    iconBox: 'bg-sky-500',
                    tag: 'bg-sky-100 text-sky-800',
                    accent: 'bg-sky-300',
                    text: 'text-sky-700',
                };
        }
    };

    // 获取图标
    const getIcon = (type: NotificationItem['type']) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="h-3.5 w-3.5 text-white" />;
            case 'warning': return <AlertTriangle className="h-3.5 w-3.5 text-white" />;
            case 'error': return <XCircle className="h-3.5 w-3.5 text-white" />;
            default: return <Info className="h-3.5 w-3.5 text-white" />;
        }
    };

    const fetchList = async () => {
        if (!isAuthenticated) {
            setNotifications([]);
            onUnreadChange?.(0);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const res = await getNotifications('unread');
            // 假设返回的是标准数组，如果是分页结构需调整
            const list = Array.isArray(res) ? res : [];
            setNotifications(list);
            onUnreadChange?.(list.length);
        } catch (e) {
            console.error(e);
            setNotifications([]);
            onUnreadChange?.(0);
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async (status: NotificationStatus = historyStatus) => {
        if (!isAuthenticated) {
            setHistoryNotifications([]);
            return;
        }
        setHistoryLoading(true);
        try {
            const res = await getNotifications(status);
            setHistoryNotifications(Array.isArray(res) ? res : []);
        } catch (error) {
            console.error('Failed to fetch notification history', error);
            setHistoryNotifications([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        fetchList();
    }, [isAuthenticated]);

    useEffect(() => {
        if (historyOpen) {
            fetchHistory(historyStatus);
        }
    }, [historyOpen, historyStatus, isAuthenticated]);

    useEffect(() => {
        // 点击外部关闭
        const handleClickOutside = (event: MouseEvent) => {
            if (selectedNotification || historyOpen) return;
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedNotification, historyOpen]);

    useEffect(() => {
        if (!selectedNotification) return;

        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !deleting) {
                setSelectedNotification(null);
                setTearing(false);
            }
        };

        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [selectedNotification, deleting]);

    useEffect(() => {
        if (!historyOpen) return;

        const closeHistoryOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setHistoryOpen(false);
            }
        };

        document.addEventListener('keydown', closeHistoryOnEscape);
        return () => document.removeEventListener('keydown', closeHistoryOnEscape);
    }, [historyOpen]);

    const handleMarkAllRead = async () => {
        if (!isAuthenticated) return;
        await markAllRead();
        setNotifications([]);
        onUnreadChange?.(0);
        if (historyOpen) fetchHistory();
    };

    const handleClickItem = async (item: NotificationItem) => {
        setTearing(false);
        setSelectedNotification({...item, isRead: true});

        if (isAuthenticated && !item.isRead) {
            await markRead(item.id);
            const next = notifications.filter(n => n.id !== item.id);
            setNotifications(next);
            onUnreadChange?.(next.length);
            if (historyOpen) fetchHistory();
        }
    };

    const handleDiscardSelected = async () => {
        if (!selectedNotification || deleting) return;

        setDeleting(true);
        setTearing(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 320));
            await deleteNotification(selectedNotification.id);
            const next = notifications.filter(item => item.id !== selectedNotification.id);
            setNotifications(next);
            onUnreadChange?.(next.length);
            if (historyOpen) await fetchHistory();
            setSelectedNotification(null);
        } catch (error) {
            console.error('Failed to delete notification', error);
            setTearing(false);
        } finally {
            setDeleting(false);
        }
    };

    const handleOpenHistory = () => {
        setHistoryOpen(true);
        setHistoryStatus('all');
    };

    const handleHistoryStatusChange = (status: NotificationStatus) => {
        setHistoryStatus(status);
    };

    const handleRestore = async (item: NotificationItem) => {
        await restoreNotification(item.id);
        await fetchHistory();
        await fetchList();
    };

    const handlePermanentDelete = async (item: NotificationItem) => {
        if (!window.confirm('确定要彻底删除这条消息吗？此操作不可恢复。')) return;
        await deleteNotificationPermanently(item.id);
        await fetchHistory();
    };

    const handleClearTrash = async () => {
        if (historyNotifications.length === 0) return;
        if (!window.confirm('确定要清空回收站吗？回收站中的消息会被彻底删除。')) return;
        await clearNotificationTrash();
        await fetchHistory();
    };

    const handleOpenLink = (item: NotificationItem) => {
        const link = item.link || '';
        const articleMatch = link.match(/^\/article\/([^/]+)\/([^/?#]+)/);
        if (articleMatch && onNavigate) {
            onNavigate('article', {
                collId: decodeURIComponent(articleMatch[1]),
                articleId: decodeURIComponent(articleMatch[2]),
            });
            setSelectedNotification(null);
            onClose();
            return;
        }
        if (link) {
            window.location.href = link;
        }
    };

    const CardPattern = () => (
        <>
            <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[size:9px_9px] opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(rgba(148,163,184,0.65)_1px,transparent_1px)] bg-[size:16px_16px] bg-[-8px_-8px] opacity-0 transition-opacity duration-300 group-hover:opacity-70" />
        </>
    );

    const BoldPattern = ({ className = '' }: { className?: string }) => (
        <svg viewBox="0 0 100 100" className={`pointer-events-none absolute z-0 opacity-10 ${className}`}>
            <path
                strokeDasharray="15 10"
                strokeWidth="10"
                stroke="currentColor"
                fill="none"
                d="M0,0 L100,0 L100,100 L0,100 Z"
            />
        </svg>
    );

    const historyTabs: Array<{ value: NotificationStatus; label: string; icon: ReactNode }> = [
        { value: 'all', label: '全部', icon: <Inbox className="h-4 w-4" /> },
        { value: 'read', label: '已读', icon: <CheckCircle2 className="h-4 w-4" /> },
        { value: 'unread', label: '未读', icon: <Bell className="h-4 w-4" /> },
        { value: 'deleted', label: '回收站', icon: <Archive className="h-4 w-4" /> },
    ];

    const renderNotificationCard = (item: NotificationItem, mode: 'dropdown' | 'history' = 'dropdown') => {
        const tone = getTone(item.type);
        const isTrash = historyStatus === 'deleted' || item.isDeleted;
        return (
            <button
                key={item.id}
                type="button"
                onClick={() => handleClickItem(item)}
                className={`group relative w-full overflow-hidden rounded-lg border-[3px] border-slate-950 bg-white text-left shadow-[5px_5px_0_#0f172a] transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[3px_3px_0_#0f172a] ${!item.isRead && !isTrash ? 'ring-2 ring-orange-300/60' : ''}`}
            >
                <CardPattern />
                <BoldPattern className="-right-2 -top-2 h-16 w-16 text-slate-950" />
                <span className={`absolute -right-5 -top-5 z-10 h-14 w-14 rotate-45 border-[3px] border-slate-950 ${tone.accent}`} />
                <span className="absolute right-2 top-1 z-20 text-sm font-black text-slate-950">★</span>

                <div className="relative z-10 flex items-center justify-between gap-2 border-b-[3px] border-slate-950 bg-orange-500 px-3 py-2 text-white">
                    <span className="min-w-0 truncate text-sm font-black uppercase tracking-wide">{item.title}</span>
                    <span className={`shrink-0 rotate-2 rounded border-2 border-slate-950 bg-white px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-slate-950 shadow-[2px_2px_0_#0f172a] ${item.isRead ? 'opacity-75' : ''}`}>
                        {isTrash ? 'TRASH' : (item.isRead ? 'READ' : 'NEW')}
                    </span>
                </div>

                <div className={`relative z-10 p-3 ${mode === 'history' ? 'sm:p-4' : ''}`}>
                    <div className="flex gap-3">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border-[3px] border-slate-950 shadow-[3px_3px_0_rgba(15,23,42,0.35)] transition-transform duration-200 group-hover:-rotate-6 ${tone.iconBox}`}>
                            {getIcon(item.type)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className={`${mode === 'history' ? 'line-clamp-3 text-sm' : 'line-clamp-2 text-xs'} font-semibold leading-5 text-slate-700`}>
                                {item.content}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-dashed border-slate-200 pt-2">
                                <span className="truncate text-[10px] font-semibold text-slate-400">
                                    {isTrash && item.deletedAt ? item.deletedAt : item.createdAt}
                                </span>
                                {isTrash ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase text-red-600">
                                        <Trash2 className="h-3 w-3" />
                                        Deleted
                                    </span>
                                ) : (
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${tone.tag}`}>
                                        {item.link && <ExternalLink className="h-3 w-3" />}
                                        {tone.label}
                                    </span>
                                )}
                            </div>
                            {isTrash && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handleRestore(item);
                                        }}
                                        className="inline-flex items-center gap-1 rounded border-2 border-slate-900 bg-lime-50 px-2 py-1 text-[11px] font-black text-lime-700 shadow-[2px_2px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        恢复
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            handlePermanentDelete(item);
                                        }}
                                        className="inline-flex items-center gap-1 rounded border-2 border-slate-900 bg-red-50 px-2 py-1 text-[11px] font-black text-red-600 shadow-[2px_2px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                        删除
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-3 -right-3 h-8 w-8 rotate-45 rounded border-[3px] border-slate-950 bg-sky-400 transition-transform duration-300 group-hover:rotate-[55deg] group-hover:scale-110" />
                </div>
            </button>
        );
    };

    const detailModal = selectedNotification ? createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-start justify-center bg-slate-900/30 px-4 pt-[15vh] pb-6 backdrop-blur-sm"
        >
            <div
                className="group relative w-full max-w-md text-slate-900 animate-in fade-in zoom-in-95 duration-150"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="relative rounded-lg border-[5px] border-slate-950 bg-white shadow-[14px_14px_0_#0f172a] transition-all duration-300 group-hover:-translate-x-1 group-hover:-translate-y-1 group-hover:shadow-[20px_20px_0_#0f172a]">
                    <CardPattern />
                    <BoldPattern className="right-2 top-2 h-28 w-28 text-slate-950" />
                    <span className={`absolute -right-6 -top-6 z-10 h-20 w-20 rotate-45 border-[3px] border-slate-950 ${getTone(selectedNotification.type).accent}`} />

                    <section className="relative z-10 overflow-hidden border-b-[5px] border-slate-950 bg-orange-500 px-5 py-4 text-white">
                        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,rgba(15,23,42,0.14),rgba(15,23,42,0.14)_8px,transparent_8px,transparent_16px)] opacity-60" />
                        <div className="relative">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-100">小橘通知</div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <div className="rotate-3 rounded border-[3px] border-slate-950 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-950 shadow-[3px_3px_0_#0f172a]">
                                        {getTone(selectedNotification.type).label}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSelectedNotification(null);
                                            setTearing(false);
                                        }}
                                        className="rounded border-[3px] border-slate-950 bg-white p-1 text-slate-800 shadow-[3px_3px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
                                        aria-label="关闭通知详情"
                                    >
                                        <XCircle className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                            <h3 className="mt-3 break-words text-2xl font-black uppercase leading-tight text-white">
                                {selectedNotification.title}
                            </h3>
                        </div>
                    </section>

                    <section
                        role="button"
                        tabIndex={0}
                        aria-label="撕下票根并丢弃通知"
                        title="点击撕下票根并丢弃通知，按 Esc 关闭"
                        onClick={handleDiscardSelected}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleDiscardSelected();
                            }
                        }}
                        className={`relative z-10 overflow-hidden bg-white px-5 pb-6 pt-5 outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-orange-500/40 ${tearing ? 'translate-y-8 rotate-2 opacity-80' : ''} ${deleting ? 'cursor-wait' : 'cursor-pointer'}`}
                    >
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className={`flex h-7 w-7 items-center justify-center rounded border-[3px] border-slate-950 shadow-[3px_3px_0_rgba(15,23,42,0.35)] ${getTone(selectedNotification.type).iconBox}`}>
                                    {getIcon(selectedNotification.type)}
                                </span>
                                <span className="text-xs font-bold text-slate-500">{selectedNotification.createdAt}</span>
                            </div>
                            <span className="rounded-full border-2 border-dashed border-slate-300 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                                {deleting ? 'Tearing' : 'Ticket'}
                            </span>
                        </div>

                        <div className="max-h-[34vh] overflow-y-auto whitespace-pre-wrap break-words text-sm font-semibold leading-7 text-slate-800">
                            {selectedNotification.content}
                        </div>

                        <div className="relative mt-6 flex items-center justify-between gap-4 border-t-[3px] border-dashed border-slate-200 pt-5">
                            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2 text-sm font-black text-slate-300">✂</span>
                            {selectedNotification.link ? (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleOpenLink(selectedNotification);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded border-[3px] border-slate-950 bg-sky-500 px-3 py-2 text-xs font-black text-white shadow-[4px_4px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-sky-600"
                                >
                                    <ExternalLink className="h-3.5 w-3.5"/>
                                    查看文章
                                </button>
                            ) : <span/>}
                            <div className="text-right">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Status</p>
                                <p className={`text-2xl font-black leading-none ${getTone(selectedNotification.type).text}`}>
                                    {selectedNotification.type.toUpperCase()}
                                </p>
                            </div>
                        </div>
                        <p className="mt-5 text-center text-[11px] font-semibold text-slate-400">
                            点击卡片主体撕下并丢弃 · Esc 关闭
                        </p>
                        <div className="pointer-events-none absolute bottom-3 right-12 flex h-16 w-16 items-center justify-center rounded-full border-[4px] border-red-500/70 text-[11px] font-black uppercase tracking-wide text-red-500/70 opacity-80 [animation:notification-read-stamp_520ms_cubic-bezier(0.2,1.4,0.35,1)_180ms_both]">
                            Read
                        </div>
                        <div className="pointer-events-none absolute -bottom-4 -right-4 h-10 w-10 rotate-45 rounded border-[3px] border-slate-950 bg-sky-400" />
                        <style>{`
                            @keyframes notification-read-stamp {
                                0% {
                                    opacity: 0;
                                    transform: translateY(10px) scale(1.35) rotate(-24deg);
                                }
                                62% {
                                    opacity: 0.82;
                                    transform: translateY(0) scale(0.92) rotate(-12deg);
                                }
                                100% {
                                    opacity: 0.7;
                                    transform: translateY(0) scale(1) rotate(-12deg);
                                }
                            }
                        `}</style>
                    </section>
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    const historyModal = historyOpen ? createPortal(
        <div
            className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm animate-in fade-in duration-150"
            onMouseDown={() => setHistoryOpen(false)}
        >
            <div
                className="relative flex max-h-[82vh] w-full max-w-5xl overflow-hidden rounded-xl border-[4px] border-slate-950 bg-white shadow-[16px_16px_0_#0f172a] animate-in zoom-in-95 duration-150"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <CardPattern />
                <aside className="relative z-10 flex w-28 shrink-0 flex-col gap-2 border-r-[4px] border-slate-950 bg-orange-50 p-3 sm:w-36">
                    <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-orange-600">History</div>
                    {historyTabs.map(tab => (
                        <button
                            key={tab.value}
                            type="button"
                            onClick={() => handleHistoryStatusChange(tab.value)}
                            className={`flex items-center gap-2 rounded border-[3px] border-slate-950 px-3 py-2 text-sm font-black shadow-[3px_3px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 ${
                                historyStatus === tab.value
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-white text-slate-800 hover:bg-orange-100'
                            }`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </aside>

                <section className="relative z-10 flex min-w-0 flex-1 flex-col bg-white">
                    <header className="flex items-center justify-between gap-4 border-b-[4px] border-slate-950 bg-orange-500 px-5 py-4 text-white">
                        <div>
                            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-100">小橘通知</div>
                            <h3 className="mt-1 text-xl font-black">历史消息</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {historyStatus === 'deleted' && (
                                <button
                                    type="button"
                                    onClick={handleClearTrash}
                                    disabled={historyNotifications.length === 0}
                                    className="inline-flex items-center gap-1.5 rounded border-[3px] border-slate-950 bg-red-50 px-3 py-2 text-xs font-black text-red-600 shadow-[3px_3px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    清空
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setHistoryOpen(false)}
                                className="rounded border-[3px] border-slate-950 bg-white p-1.5 text-slate-800 shadow-[3px_3px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
                                aria-label="关闭历史消息"
                            >
                                <XCircle className="h-4 w-4" />
                            </button>
                        </div>
                    </header>

                    <div className="min-h-[420px] overflow-y-auto bg-slate-50/70 p-4">
                        {historyLoading ? (
                            <div className="flex h-64 items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                            </div>
                        ) : historyNotifications.length === 0 ? (
                            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                                <Bell className="h-10 w-10 text-slate-200" />
                                <p className="text-sm font-semibold text-slate-400">这里还没有消息</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                                {historyNotifications.map(item => renderNotificationCard(item, 'history'))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
        <div ref={wrapperRef} className="absolute right-0 top-full z-50 mt-3 w-80 overflow-hidden rounded-lg border-[4px] border-slate-950 bg-white shadow-[10px_10px_0_#0f172a] animate-in fade-in slide-in-from-top-2 duration-200 sm:w-96">
            <div className="relative overflow-hidden border-b-[4px] border-slate-950 bg-white px-4 py-3">
                <CardPattern />
                <div className="relative z-10 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900">系统通知</h3>
                <button
                    onClick={handleMarkAllRead}
                    disabled={!isAuthenticated || notifications.length === 0}
                    className="flex items-center gap-1 rounded border-2 border-slate-950 bg-orange-50 px-2 py-1 text-xs font-black text-orange-600 shadow-[2px_2px_0_#0f172a] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    <Check className="h-3 w-3" /> 全部已读
                </button>
                </div>
            </div>

            <div className="max-h-[430px] overflow-y-auto bg-slate-50/60 p-3">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                        <Bell className="h-8 w-8 text-slate-200" />
                        <p className="text-xs text-slate-400">暂无新通知</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {notifications.map(item => renderNotificationCard(item))}
                    </div>
                )}
            </div>

            <div className="border-t-[4px] border-slate-950 bg-white px-4 py-2 text-center">
                <button
                    type="button"
                    onClick={handleOpenHistory}
                    disabled={!isAuthenticated}
                    className="text-xs font-black text-slate-500 transition-colors hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    查看历史通知
                </button>
            </div>
        </div>

        {detailModal}
        {historyModal}
        </>
    );
}
