// --- 消息通知相关类型定义 ---

export interface NotificationItem {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'success' | 'warning' | 'error';
    link?: string;
    isRead: boolean;
    isDeleted?: boolean;
    createdAt: string;
    deletedAt?: string | null;
}

export type NotificationStatus = 'all' | 'read' | 'unread' | 'deleted';
