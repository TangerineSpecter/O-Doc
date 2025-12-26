// --- 消息通知相关类型定义 ---

export interface NotificationItem {
    id: number;
    title: string;
    content: string;
    type: 'info' | 'success' | 'warning' | 'error';
    link?: string;
    isRead: boolean;
    createdAt: string;
}