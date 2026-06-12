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

    // 获取图标
    const getIcon = (type: string) => {
        switch (type) {
            case 'success': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
            case 'error': return <XCircle className="w-4 h-4 text-red-500" />;
            default: return <Info className="w-4 h-4 text-blue-500" />;
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

    const TangerineLogo = () => (
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-100 bg-orange-50 shadow-[0_4px_18px_rgba(249,115,22,0.22)]">
            <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10">
                <path d="M12 3.5V6.5" stroke="#9a3412" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="12" cy="14" r="8.5" className="fill-orange-500" />
                <path d="M12 6.5C12 6.5 10 1 5 3C1 5 4 10 12 6.5Z" className="fill-lime-500" />
            </svg>
        </div>
    );

    const detailModal = selectedNotification ? createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-start justify-center bg-slate-900/30 px-4 pt-[15vh] pb-6 backdrop-blur-sm"
        >
            <div
            className="group relative w-full max-w-md text-slate-900 animate-in fade-in zoom-in-95 duration-150"
            onClick={(event) => event.stopPropagation()}
        >
                <div className="relative rounded-2xl bg-transparent shadow-[0_24px_48px_rgba(15,23,42,0.18)] transition-all duration-500 group-hover:-rotate-1 group-hover:scale-[1.01] group-hover:drop-shadow-[0_0_28px_rgba(249,115,22,0.35)]">
                    <section className="relative overflow-hidden rounded-t-2xl bg-white px-7 pb-5 pt-5">
                        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(249,115,22,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(249,115,22,0.08)_1px,transparent_1px)] bg-[size:22px_22px]" />
                        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-100 blur-2xl" />
                        <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-amber-100 blur-xl" />
                        <div className="relative z-10">
                            <div className="mb-4 flex items-start justify-between gap-4 pr-8">
                                <div className="flex items-center gap-2 text-sm font-black tracking-tight text-slate-900">
                                    <TangerineLogo />
                                    <span>小橘通知</span>
                                </div>
                                <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600">
                                    Message
                                </div>
                            </div>

                            <h3 className="break-words bg-gradient-to-br from-slate-950 to-orange-500 bg-clip-text text-4xl font-black uppercase leading-[1.05] text-transparent">
                                {selectedNotification.title}
                            </h3>
                            <p className="mt-2 text-sm font-medium text-slate-500">
                                {selectedNotification.createdAt}
                            </p>
                        </div>
                        <div className="absolute -bottom-3 left-0 right-0 z-20 flex items-center">
                            <div className="-ml-3 h-6 w-6 shrink-0 rounded-full bg-slate-900/30 shadow-inner" />
                            <div className="h-px flex-1 border-t-2 border-dashed border-slate-200" />
                            <div className="-mr-3 h-6 w-6 shrink-0 rounded-full bg-slate-900/30 shadow-inner" />
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
                        className={`relative overflow-hidden rounded-b-2xl bg-slate-50 px-7 pb-8 pt-9 outline-none transition-all duration-300 hover:bg-orange-50 focus-visible:ring-2 focus-visible:ring-orange-500/30 ${tearing ? 'translate-y-8 rotate-2' : ''} ${deleting ? 'cursor-wait' : 'cursor-pointer'}`}
                    >
                        <div className="absolute -top-3 left-0 right-0 z-20 flex items-center">
                            <div className="-ml-3 h-6 w-6 shrink-0 rounded-full bg-slate-900/30 shadow-inner" />
                            <div className="h-px flex-1 border-t-2 border-dashed border-transparent" />
                            <div className="-mr-3 h-6 w-6 shrink-0 rounded-full bg-slate-900/30 shadow-inner" />
                        </div>
                        <div className="max-h-[34vh] overflow-y-auto whitespace-pre-wrap break-words text-sm font-medium leading-7 text-slate-700">
                            {selectedNotification.content}
                        </div>
                        <div className="mt-6 flex items-end justify-between gap-5">
                            {selectedNotification.link ? (
                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        handleOpenLink(selectedNotification);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600"
                                >
                                    <ExternalLink className="h-3.5 w-3.5"/>
                                    查看文章
                                </button>
                            ) : <span/>}
                            <div className="text-right">
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                                    {deleting ? 'Tearing' : 'Tear'}
                                </p>
                                <p className="text-3xl font-black leading-none text-orange-500 drop-shadow-[0_0_12px_rgba(249,115,22,0.25)]">
                                    {deleting ? '...' : selectedNotification.type.toUpperCase()}
                                </p>
                            </div>
                        </div>
                        <p className="mt-5 text-center text-[11px] font-medium text-slate-400">
                            点击票根撕下并丢弃 · Esc 关闭
                        </p>
                    </section>
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
        <div ref={wrapperRef} className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-semibold text-slate-800 text-sm">系统通知</h3>
                <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                >
                    <Check className="w-3 h-3" /> 全部已读
                </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto">
                {loading ? (
                    <div className="py-8 flex justify-center">
                        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="py-8 text-center flex flex-col items-center gap-2">
                        <Bell className="w-8 h-8 text-slate-200" />
                        <p className="text-xs text-slate-400">暂无新通知</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-50">
                        {notifications.map(item => (
                            <div
                                key={item.id}
                                onClick={() => handleClickItem(item)}
                                className={`px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors relative group ${!item.isRead ? 'bg-blue-50/30' : ''}`}
                            >
                                <div className="flex gap-3 items-start">
                                    <div className="mt-0.5 shrink-0">
                                        {getIcon(item.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start gap-2">
                                            <p className={`text-sm ${!item.isRead ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
                                                {item.title}
                                            </p>
                                            {!item.isRead && (
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                                            {item.content}
                                        </p>
                                        <div className="flex justify-between items-center mt-2">
                                            <span className="text-[10px] text-slate-400">{item.createdAt}</span>
                                            {item.link && (
                                                <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-orange-400" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center">
                <button className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                    查看历史通知
                </button>
            </div>
        </div>

        {detailModal}
        </>
    );
}
