import { useEffect, useState, useRef } from 'react';
import { Bell, Check, Info, AlertTriangle, XCircle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { getNotifications, markAllRead, markRead, NotificationItem } from '../api/message';

interface NotificationPopoverProps {
    onClose: () => void;
    onNavigate?: (viewName: string, params?: any) => void;
}

export default function NotificationPopover({ onClose, onNavigate }: NotificationPopoverProps) {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
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
            setNotifications(Array.isArray(res) ? res : []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchList();

        // 点击外部关闭
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAllRead = async () => {
        await markAllRead();
        fetchList(); // 刷新列表
    };

    const handleClickItem = async (item: NotificationItem) => {
        if (!item.isRead) {
            await markRead(item.id);
            setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, isRead: true } : n));
        }

        if (item.link && onNavigate) {
            // 解析 Link，这里假设 link 格式是 "/article/123" 或者是简单的 URL
            // 你可以根据实际业务解析跳转
            onClose();
            // 简单的示例：如果 link 包含 articleId，跳转到文章
            // 实际可能需要根据 link 格式做更复杂的路由解析
            console.log("Navigating to:", item.link);
        }
    };

    return (
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
    );
}