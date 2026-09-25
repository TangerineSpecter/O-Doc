import { useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {useEscapeDismissal} from '../hooks/useEscapeDismissal';
import {
    Archive,
    Bell,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ExternalLink,
    AlertTriangle,
    Inbox,
    Loader2,
    MessageSquare,
    RotateCcw,
    StickyNote,
    Trash2,
    X,
    XCircle,
    Zap
} from 'lucide-react';
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

// 格式化人性化相对时间
function formatRelativeTime(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(diffMs) || diffMs < 0) return dateStr.split(' ')[0] || dateStr;

    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return '刚刚';
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;
    if (diffDay === 1) {
        const timePart = dateStr.includes(' ') ? dateStr.split(' ')[1].slice(0, 5) : '';
        return timePart ? `昨天 ${timePart}` : '昨天';
    }
    if (diffDay < 7) return `${diffDay}天前`;
    return dateStr.split(' ')[0] || dateStr;
}

// 语义化图标与色彩解析
interface NotificationVisual {
    icon: ReactNode;
    bgColor: string;
    textColor: string;
    categoryTag?: string;
    tagTone?: string;
}

function getNotificationVisual(item: NotificationItem): NotificationVisual {
    const title = item.title || '';
    const content = item.content || '';
    const type = item.type;

    // 1. 评论互动
    if (title.includes('评论') || title.includes('回复') || content.includes('评论')) {
        return {
            icon: <MessageSquare className="h-4 w-4" />,
            bgColor: 'bg-orange-100 text-orange-600',
            textColor: 'text-orange-600',
            categoryTag: '评论',
            tagTone: 'bg-orange-50 text-orange-700 border border-orange-100'
        };
    }

    // 2. Memos 灵感便签
    if (title.toLowerCase().includes('memos') || title.includes('便签') || title.includes('记录')) {
        return {
            icon: <StickyNote className="h-4 w-4" />,
            bgColor: 'bg-emerald-100 text-emerald-600',
            textColor: 'text-emerald-600',
            categoryTag: 'Memos',
            tagTone: 'bg-emerald-50 text-emerald-700 border border-emerald-100'
        };
    }

    // 3. 系统任务 / 同步
    if (title.includes('同步') || title.includes('完成') || title.includes('RAG') || title.includes('索引') || type === 'success') {
        return {
            icon: <Zap className="h-4 w-4" />,
            bgColor: 'bg-sky-100 text-sky-600',
            textColor: 'text-sky-600',
            categoryTag: '系统',
            tagTone: 'bg-sky-50 text-sky-700 border border-sky-100'
        };
    }

    // 4. 警报/错误
    if (type === 'error') {
        return {
            icon: <XCircle className="h-4 w-4" />,
            bgColor: 'bg-rose-100 text-rose-600',
            textColor: 'text-rose-600',
            categoryTag: '异常',
            tagTone: 'bg-rose-50 text-rose-700 border border-rose-100'
        };
    }

    if (type === 'warning') {
        return {
            icon: <AlertTriangle className="h-4 w-4" />,
            bgColor: 'bg-amber-100 text-amber-600',
            textColor: 'text-amber-600',
            categoryTag: '提醒',
            tagTone: 'bg-amber-50 text-amber-700 border border-amber-100'
        };
    }

    // 默认通知
    return {
        icon: <Bell className="h-4 w-4" />,
        bgColor: 'bg-slate-100 text-slate-600',
        textColor: 'text-slate-600',
        categoryTag: '通知',
        tagTone: 'bg-slate-100 text-slate-700 border border-slate-200'
    };
}

// 格式化解析通知标题：拆解人物主体、动作与标的文档
function renderFormattedNotificationTitle(item: NotificationItem, isDetail = false) {
    const title = item.title || '';
    // 匹配如："哈哈 评论了《xxx》" 或 "张三 评论了 《xxx》" 或 "李四 回复了《xxx》"
    const commentMatch = title.match(/^(.+?)\s*(评论了|回复了)\s*[《<](.+?)[》>]$/);
    if (commentMatch) {
        const [, actor, action, target] = commentMatch;
        return (
            <div className={`leading-snug ${isDetail ? 'text-base font-medium' : 'text-xs sm:text-sm'} text-slate-700`}>
                <span className="font-bold text-slate-900">{actor}</span>
                <span className="text-slate-400 mx-1">在</span>
                <span className="font-semibold text-slate-800 transition-colors group-hover:text-orange-600">《{target}》</span>
                <span className="text-slate-400 ml-1">{action}</span>
            </div>
        );
    }

    // 匹配 Memos 便签类通知
    const memoMatch = title.match(/^Memos\s*[·・]\s*(.+)$/i);
    if (memoMatch) {
        return (
            <div className="flex items-center gap-1.5 flex-wrap leading-snug">
                <span className={`font-bold text-slate-900 ${isDetail ? 'text-base' : 'text-xs sm:text-sm'}`}>Memos 灵感便签</span>
                <span className="rounded px-1.5 py-0.2 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                    {memoMatch[1]}
                </span>
            </div>
        );
    }

    return (
        <span className={`line-clamp-1 font-bold text-slate-900 transition-colors group-hover:text-orange-600 ${isDetail ? 'text-base' : 'text-xs sm:text-sm'}`}>
            {title}
        </span>
    );
}

export default function NotificationPopover({ isAuthenticated, onClose, onNavigate, onUnreadChange }: NotificationPopoverProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [historyNotifications, setHistoryNotifications] = useState<NotificationItem[]>([]);
    const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyStatus, setHistoryStatus] = useState<NotificationStatus>('all');
    const [isExpanded, setIsExpanded] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const mobileSheetRef = useRef<HTMLDivElement>(null);
    useEscapeDismissal(true, onClose);
    useEscapeDismissal(historyOpen, () => setHistoryOpen(false));
    useEscapeDismissal(Boolean(selectedNotification), () => setSelectedNotification(null));

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
        const handleClickOutside = (event: MouseEvent) => {
            if (selectedNotification || historyOpen) return;
            const target = event.target as Node;
            if (mobileSheetRef.current && mobileSheetRef.current.contains(target)) {
                return;
            }
            if (wrapperRef.current && !wrapperRef.current.contains(target)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedNotification, historyOpen]);

    const handleMarkAllRead = async () => {
        if (!isAuthenticated) return;
        await markAllRead();
        setNotifications([]);
        onUnreadChange?.(0);
        if (historyOpen) fetchHistory();
    };

    const handleClickItem = async (item: NotificationItem) => {
        setSelectedNotification({ ...item, isRead: true });

        if (isAuthenticated && !item.isRead) {
            await markRead(item.id);
            const next = notifications.filter(n => n.id !== item.id);
            setNotifications(next);
            onUnreadChange?.(next.length);
            if (historyOpen) fetchHistory();
        }
    };

    const handleDeleteSelected = async () => {
        if (!selectedNotification) return;
        try {
            await deleteNotification(selectedNotification.id);
            const next = notifications.filter(item => item.id !== selectedNotification.id);
            setNotifications(next);
            onUnreadChange?.(next.length);
            if (historyOpen) await fetchHistory();
            setSelectedNotification(null);
        } catch (error) {
            console.error('Failed to delete notification', error);
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

    const historyTabs: Array<{ value: NotificationStatus; label: string; icon: ReactNode }> = [
        { value: 'all', label: '全部', icon: <Inbox className="h-4 w-4" /> },
        { value: 'read', label: '已读', icon: <CheckCircle2 className="h-4 w-4" /> },
        { value: 'unread', label: '未读', icon: <Bell className="h-4 w-4" /> },
        { value: 'deleted', label: '回收站', icon: <Archive className="h-4 w-4" /> },
    ];

    // 历史记录面板卡片渲染（符合小橘文档规范的卡片）
    const renderNotificationCard = (item: NotificationItem) => {
        const visual = getNotificationVisual(item);
        const isTrash = historyStatus === 'deleted' || item.isDeleted;
        const isCommentOrMemo = item.title.includes('评论') || item.title.includes('回复') || item.title.toLowerCase().includes('memos');

        return (
            <div
                key={item.id}
                onClick={() => handleClickItem(item)}
                className={`group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left p-4 shadow-xs hover:border-orange-200 hover:shadow-md transition-all duration-200 cursor-pointer ${
                    !item.isRead && !isTrash ? 'bg-orange-50/20 ring-1 ring-orange-200/60' : ''
                }`}
            >
                <div className="flex items-start gap-3.5">
                    <div className={`mt-0.5 shrink-0 rounded-xl p-2.5 shadow-2xs ${visual.bgColor}`}>
                        {visual.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                                {renderFormattedNotificationTitle(item)}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                <span className="text-[11px] text-slate-400 font-medium">
                                    {formatRelativeTime(item.createdAt)}
                                </span>
                                {!item.isRead && !isTrash && (
                                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                )}
                            </div>
                        </div>

                        {/* 评论或便签内容 */}
                        {isCommentOrMemo ? (
                            <div className="mt-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 group-hover:border-orange-200/60 transition-colors text-xs text-slate-600 leading-5 line-clamp-3 overflow-hidden">
                                “{item.content}”
                            </div>
                        ) : (
                            <p className="mt-1.5 text-xs text-slate-500 leading-5 line-clamp-3 overflow-hidden">
                                {item.content}
                            </p>
                        )}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
                            <span className="text-[11px] text-slate-400 font-mono shrink min-w-0 truncate" title={isTrash && item.deletedAt ? `删除时间: ${item.deletedAt}` : item.createdAt}>
                                {isTrash && item.deletedAt ? `删除时间: ${item.deletedAt}` : item.createdAt}
                            </span>

                            {isTrash ? (
                                <div className="flex items-center gap-2 shrink-0 ml-auto" onClick={e => e.stopPropagation()}>
                                    <button
                                        type="button"
                                        onClick={() => handleRestore(item)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                                    >
                                        <RotateCcw className="h-3 w-3 shrink-0" />
                                        <span>恢复</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePermanentDelete(item)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 active:bg-red-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                                    >
                                        <Trash2 className="h-3 w-3 shrink-0" />
                                        <span>彻底删除</span>
                                    </button>
                                </div>
                            ) : (
                                item.link && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-600 hover:text-orange-700 whitespace-nowrap shrink-0 ml-auto">
                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                        <span>查看原文章</span>
                                    </span>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // 浮动气泡与抽屉列表项渲染
    const renderDropdownNotificationItem = (item: NotificationItem, isMobile = false) => {
        const visual = getNotificationVisual(item);
        const isCommentOrMemo = item.title.includes('评论') || item.title.includes('回复') || item.title.toLowerCase().includes('memos');

        return (
            <button
                key={item.id}
                type="button"
                onClick={() => handleClickItem(item)}
                className={`group relative w-full text-left transition-all ${
                    isMobile ? 'p-3.5' : 'px-4 py-3'
                } ${
                    !item.isRead
                        ? 'bg-orange-50/20 hover:bg-orange-50/50'
                        : 'bg-white hover:bg-slate-50'
                }`}
            >
                <div className="flex items-start gap-3">
                    {/* 语义化图标 */}
                    <div className={`mt-0.5 shrink-0 rounded-xl p-2 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${visual.bgColor}`}>
                        {visual.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                        {/* 标题、时间与未读呼吸指示点 */}
                        <div className="flex items-start justify-between gap-1.5">
                            <div className="min-w-0 flex-1">
                                {renderFormattedNotificationTitle(item)}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-1">
                                <span className="text-[10px] text-slate-400 font-medium">
                                    {formatRelativeTime(item.createdAt)}
                                </span>
                                {!item.isRead && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
                                )}
                            </div>
                        </div>

                        {/* 评论或便签内容：轻浅卡片化引用 */}
                        {isCommentOrMemo ? (
                            <div className="mt-1.5 p-2 rounded-lg bg-slate-50/80 border border-slate-100 group-hover:border-orange-200/60 group-hover:bg-orange-50/20 transition-all text-xs text-slate-600 leading-relaxed line-clamp-2">
                                “{item.content}”
                            </div>
                        ) : (
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                                {item.content}
                            </p>
                        )}

                        {/* 底部微操作悬浮引导（取代原先死板占位的“点击前往查看”） */}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                            <span className="text-[10px] text-slate-400">
                                {item.link ? '点击查看批注与原文' : '点击查看详情'}
                            </span>
                            {item.link && (
                                <span className="text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-0.5 font-medium text-[10px]">
                                    <span>前往查看</span>
                                    <ChevronRight className="h-3 w-3" />
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </button>
        );
    };

    // 详情模态框（统一小橘文档视觉规范）
    const detailModal = selectedNotification ? createPortal(
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={() => setSelectedNotification(null)}
        >
            <div
                className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 text-slate-800"
                onClick={(event) => event.stopPropagation()}
            >
                {/* 头部 */}
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl shadow-2xs ${getNotificationVisual(selectedNotification).bgColor}`}>
                            {getNotificationVisual(selectedNotification).icon}
                        </div>
                        <div>
                            <div className="text-xs text-slate-400 font-medium">通知详情</div>
                            <div className="text-xs text-slate-500 font-mono mt-0.5">{selectedNotification.createdAt}</div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelectedNotification(null)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                        aria-label="关闭"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* 内容区 */}
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    <div>
                        <div className="text-xs font-semibold text-slate-400 mb-1">通知主题</div>
                        {renderFormattedNotificationTitle(selectedNotification, true)}
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-slate-400 mb-1.5">详细内容</div>
                        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 whitespace-pre-wrap break-words text-sm text-slate-700 leading-relaxed font-normal">
                            {selectedNotification.content}
                        </div>
                    </div>
                </div>

                {/* 底部操作条 */}
                <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleDeleteSelected}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>删除通知</span>
                    </button>

                    <div className="flex items-center gap-2">
                        {selectedNotification.link ? (
                            <button
                                type="button"
                                onClick={() => handleOpenLink(selectedNotification)}
                                className="px-4 py-2 text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 active:bg-orange-700 rounded-lg transition-colors shadow-xs shadow-orange-500/20 flex items-center gap-1.5"
                            >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>前往查看原文</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setSelectedNotification(null)}
                                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
                            >
                                关闭
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    // 历史消息模态框（统一小橘文档视觉规范）
    const historyModal = historyOpen ? createPortal(
        <div
            className="fixed inset-0 z-[190] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onMouseDown={() => setHistoryOpen(false)}
        >
            <div
                className="relative flex flex-col md:flex-row max-h-[85vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-150"
                onMouseDown={(event) => event.stopPropagation()}
            >
                {/* 侧边导航 */}
                <aside className="relative z-10 flex md:flex-col gap-1.5 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/80 p-3 sm:p-4 w-full md:w-44 shrink-0 overflow-x-auto">
                    <div className="hidden md:block mb-3 px-2 text-xs font-bold text-slate-400 tracking-wider">
                        通知记录
                    </div>
                    {historyTabs.map(tab => (
                        <button
                            key={tab.value}
                            type="button"
                            onClick={() => handleHistoryStatusChange(tab.value)}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                                historyStatus === tab.value
                                    ? 'bg-orange-500 text-white shadow-xs shadow-orange-500/20'
                                    : 'text-slate-600 hover:bg-slate-200/60'
                            }`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </aside>

                {/* 主内容区 */}
                <section className="relative z-10 flex min-w-0 flex-1 flex-col bg-white">
                    <header className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/40 px-5 py-3.5">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 whitespace-nowrap">
                                {historyTabs.find(t => t.value === historyStatus)?.label}通知
                            </h3>
                            <span className="text-xs text-slate-400 font-mono">
                                ({historyNotifications.length})
                            </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {historyStatus === 'deleted' && (
                                <button
                                    type="button"
                                    onClick={handleClearTrash}
                                    disabled={historyNotifications.length === 0}
                                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap shrink-0"
                                >
                                    <Trash2 className="h-3 w-3 shrink-0" />
                                    <span>清空回收站</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setHistoryOpen(false)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                                aria-label="关闭历史消息"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    </header>

                    <div className="min-h-[420px] max-h-[70vh] overflow-y-auto bg-slate-50/50 p-4">
                        {historyLoading ? (
                            <div className="flex h-64 items-center justify-center">
                                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                            </div>
                        ) : historyNotifications.length === 0 ? (
                            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-slate-400">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                                    <Bell className="h-6 w-6" />
                                </div>
                                <p className="text-xs font-semibold text-slate-500">这里还没有消息</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                                {historyNotifications.map(item => renderNotificationCard(item))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>,
        document.body
    ) : null;

    // 移动端底部抽屉
    const mobileDrawer = typeof document !== 'undefined' ? createPortal(
        <div className="md:hidden fixed inset-0 z-[120] flex flex-col justify-end animate-in fade-in duration-200">
            <div
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
                onClick={onClose}
            />

            <div
                ref={mobileSheetRef}
                className={`relative z-10 w-full bg-white shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-out ${
                    isExpanded ? 'h-full max-h-screen rounded-t-none' : 'h-[62vh] rounded-t-3xl'
                }`}
            >
                <div className="pt-2.5 pb-1 flex flex-col items-center shrink-0 border-b border-slate-100/70 bg-slate-50/60">
                    <div className="w-10 h-1 bg-slate-300 rounded-full" />
                    <button
                        type="button"
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 hover:text-orange-700 py-0.5 px-3 rounded-full hover:bg-orange-100/60 active:scale-95 transition-all"
                    >
                        {isExpanded ? (
                            <>
                                <ChevronDown className="h-3.5 w-3.5" />
                                <span>收起显示</span>
                            </>
                        ) : (
                            <>
                                <ChevronUp className="h-3.5 w-3.5" />
                                <span>点击铺满</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">通知中心</h3>
                        {notifications.length > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">
                                {notifications.length} 未读
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleMarkAllRead}
                            disabled={!isAuthenticated || notifications.length === 0}
                            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 active:bg-orange-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Check className="h-3.5 w-3.5" /> 全部已读
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                            aria-label="关闭"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-white">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
                            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                            <span className="text-xs font-medium">加载通知中...</span>
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Bell className="h-6 w-6" />
                            </div>
                            <p className="text-xs font-semibold text-slate-600">暂无新通知</p>
                            <p className="text-[11px] text-slate-400">所有消息都已处理完毕</p>
                        </div>
                    ) : (
                        notifications.map(item => renderDropdownNotificationItem(item, true))
                    )}
                </div>

                <div className="p-3 border-t border-slate-100 bg-slate-50 shrink-0">
                    <button
                        type="button"
                        onClick={handleOpenHistory}
                        disabled={!isAuthenticated}
                        className="w-full py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:text-orange-600 hover:border-orange-200 shadow-2xs flex items-center justify-center gap-1 transition-all disabled:opacity-40"
                    >
                        <span>查看历史通知记录</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            {/* PC 桌面端浮动气泡 */}
            <div ref={wrapperRef} className="hidden md:block absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl shadow-slate-900/10 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900">系统通知</h3>
                        {notifications.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold">
                                {notifications.length} 未读
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        disabled={!isAuthenticated || notifications.length === 0}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        <Check className="h-3 w-3" /> 全部已读
                    </button>
                </div>

                <div className="max-h-[420px] overflow-y-auto bg-white divide-y divide-slate-100">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-8 text-center">
                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                                <Bell className="h-5 w-5 text-slate-400" />
                            </div>
                            <p className="text-xs font-medium text-slate-500">暂无新通知</p>
                            <p className="text-[11px] text-slate-400">所有消息都已处理完毕</p>
                        </div>
                    ) : (
                        notifications.map(item => renderDropdownNotificationItem(item, false))
                    )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-center">
                    <button
                        type="button"
                        onClick={handleOpenHistory}
                        disabled={!isAuthenticated}
                        className="text-xs font-semibold text-slate-500 transition-colors hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-45 inline-flex items-center gap-1"
                    >
                        <span>查看历史通知记录</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                </div>
            </div>

            {/* 移动端底部抽屉 */}
            {mobileDrawer}

            {detailModal}
            {historyModal}
        </>
    );
}
