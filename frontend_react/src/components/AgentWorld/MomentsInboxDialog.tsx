import WorldDialog from './WorldDialog';
import AgentAvatar from './AgentAvatar';
import type {SocialNotification} from '../../types/api/social';
import {socialTime} from '../../utils/socialTime';
import {Bell, MessageCircle} from 'lucide-react';

interface MomentsInboxDialogProps {
    notifications: SocialNotification[];
    onClose: () => void;
    onSelectNotification: (item: SocialNotification) => void;
}

export default function MomentsInboxDialog({
    notifications,
    onClose,
    onSelectNotification,
}: MomentsInboxDialogProps) {
    const unreadCount = notifications.filter(n => !n.readAt).length;

    return (
        <WorldDialog
            title="互动消息"
            description="居民对你的动态与讨论的回复提醒。"
            size="compact"
            onClose={onClose}
        >
            <div className="flex h-full min-h-0 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between px-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                        <Bell className="h-3.5 w-3.5 text-orange-500" />
                        全部互动 ({notifications.length})
                    </span>
                    {unreadCount > 0 && (
                        <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-600 border border-orange-200">
                            {unreadCount} 条未读
                        </span>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto space-y-2.5 pb-2 scrollbar-hide">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 border border-slate-100 text-slate-300">
                                <MessageCircle className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-medium text-slate-500">暂无互动消息</p>
                            <p className="mt-1 text-xs text-slate-400">
                                当有居民参与你的朋友圈或帖子讨论时，会在这里通知你。
                            </p>
                        </div>
                    ) : (
                        notifications.map(n => {
                            const isUnread = !n.readAt;
                            const actionText =
                                n.sourceKind === 'moment'
                                    ? '回复了朋友圈讨论'
                                    : '回复了帖子讨论';

                            return (
                                <button
                                    key={n.id}
                                    type="button"
                                    onClick={() => onSelectNotification(n)}
                                    className={`group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all active:scale-[0.99] ${
                                        isUnread
                                            ? 'border-orange-200/90 bg-orange-50/40 hover:bg-orange-50/70 hover:border-orange-300'
                                            : 'border-slate-100 bg-white hover:bg-slate-50/80 hover:border-slate-200'
                                    }`}
                                >
                                    <AgentAvatar
                                        name={n.identity.name || '参与者'}
                                        avatar={n.identity.avatar}
                                        size="sm"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span
                                                className={`truncate text-xs font-semibold ${
                                                    isUnread ? 'text-slate-900' : 'text-slate-700'
                                                }`}
                                            >
                                                {n.identity.name || '参与者'}
                                            </span>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <time className="text-[11px] text-slate-400">
                                                    {socialTime(n.createdAt)}
                                                </time>
                                                {isUnread && (
                                                    <span
                                                        className="h-2 w-2 rounded-full bg-orange-500 shrink-0"
                                                        title="未读消息"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                        <p
                                            className={`mt-1 text-xs ${
                                                isUnread
                                                    ? 'font-medium text-slate-800'
                                                    : 'text-slate-500'
                                            }`}
                                        >
                                            {actionText}
                                        </p>
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </WorldDialog>
    );
}
