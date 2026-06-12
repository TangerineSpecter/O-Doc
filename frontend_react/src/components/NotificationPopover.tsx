import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, Info, AlertTriangle, XCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { deleteNotification, getNotifications, markAllRead, markRead, NotificationItem } from '../api/message';

interface NotificationPopoverProps {
    onClose: () => void;
    onNavigate?: (viewName: string, params?: any) => void;
    onUnreadChange?: (count: number) => void;
}

export default function NotificationPopover({ onClose, onNavigate, onUnreadChange }: NotificationPopoverProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
    const [loading, setLoading] = useState(true);
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
        try {
            const res = await getNotifications();
            // 假设返回的是标准数组，如果是分页结构需调整
            const list = Array.isArray(res) ? res : [];
            setNotifications(list);
            onUnreadChange?.(list.filter(item => !item.isRead).length);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchList();
    }, []);

    useEffect(() => {
        // 点击外部关闭
        const handleClickOutside = (event: MouseEvent) => {
            if (selectedNotification) return;
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedNotification]);

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

    const handleMarkAllRead = async () => {
        await markAllRead();
        setNotifications(prev => prev.map(item => ({...item, isRead: true})));
        onUnreadChange?.(0);
        fetchList(); // 刷新列表
    };

    const handleClickItem = async (item: NotificationItem) => {
        setTearing(false);
        setSelectedNotification({...item, isRead: true});

        if (!item.isRead) {
            await markRead(item.id);
            const next = notifications.map(n => n.id === item.id ? { ...n, isRead: true } : n);
            setNotifications(next);
            onUnreadChange?.(next.filter(n => !n.isRead).length);
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
            onUnreadChange?.(next.filter(item => !item.isRead).length);
            setSelectedNotification(null);
        } catch (error) {
            console.error('Failed to delete notification', error);
            setTearing(false);
        } finally {
            setDeleting(false);
        }
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

    return (
        <>
        <div ref={wrapperRef} className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 animate-in fade-in slide-in-from-top-2 duration-200 sm:w-96">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-800">系统通知</h3>
                <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50 hover:text-orange-700"
                >
                    <Check className="h-3 w-3" /> 全部已读
                </button>
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
                        {notifications.map(item => {
                            const tone = getTone(item.type);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleClickItem(item)}
                                    className={`group relative w-full overflow-hidden rounded-lg border-[3px] border-slate-950 bg-white text-left shadow-[5px_5px_0_#0f172a] transition-all duration-300 hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_#0f172a] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[3px_3px_0_#0f172a] ${!item.isRead ? 'ring-2 ring-orange-300/60' : ''}`}
                                >
                                    <CardPattern />
                                    <BoldPattern className="-right-2 -top-2 h-16 w-16 text-slate-950" />
                                    <span className={`absolute -right-5 -top-5 z-10 h-14 w-14 rotate-45 border-[3px] border-slate-950 ${tone.accent}`} />
                                    <span className="absolute right-2 top-1 z-20 text-sm font-black text-slate-950">★</span>

                                    <div className="relative z-10 flex items-center justify-between gap-2 border-b-[3px] border-slate-950 bg-orange-500 px-3 py-2 text-white">
                                        <span className="min-w-0 truncate text-sm font-black uppercase tracking-wide">{item.title}</span>
                                        <span className={`shrink-0 rotate-2 rounded border-2 border-slate-950 bg-white px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-slate-950 shadow-[2px_2px_0_#0f172a] ${!item.isRead ? '' : 'opacity-75'}`}>
                                            {item.isRead ? 'READ' : 'NEW'}
                                        </span>
                                    </div>

                                    <div className="relative z-10 p-3">
                                        <div className="flex gap-3">
                                            <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border-[3px] border-slate-950 shadow-[3px_3px_0_rgba(15,23,42,0.35)] transition-transform duration-200 group-hover:-rotate-6 ${tone.iconBox}`}>
                                                {getIcon(item.type)}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="line-clamp-2 text-xs font-semibold leading-5 text-slate-700">
                                                    {item.content}
                                                </p>
                                                <div className="mt-3 flex items-center justify-between gap-3 border-t-2 border-dashed border-slate-200 pt-2">
                                                    <span className="truncate text-[10px] font-semibold text-slate-400">{item.createdAt}</span>
                                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${tone.tag}`}>
                                                        {item.link && <ExternalLink className="h-3 w-3" />}
                                                        {tone.label}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="pointer-events-none absolute -bottom-3 -right-3 h-8 w-8 rotate-45 rounded border-[3px] border-slate-950 bg-sky-400 transition-transform duration-300 group-hover:rotate-[55deg] group-hover:scale-110" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 bg-white px-4 py-2 text-center">
                <button className="text-xs text-slate-400 transition-colors hover:text-slate-600">
                    查看历史通知
                </button>
            </div>
        </div>

        {detailModal}
        </>
    );
}
