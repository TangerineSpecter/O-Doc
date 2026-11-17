import request from '../utils/request';
import type { NotificationItem, NotificationPage, NotificationStatus } from '../types/api/message';

// 重新导出类型以便其他组件使用
export type { NotificationItem, NotificationStatus };

export const getNotificationPage = (status: NotificationStatus, page: number, signal: AbortSignal) =>
    request.get<unknown, NotificationPage>('/message/notifications/', {params: {status, page}, signal});

export const getUnreadNotificationCount = (signal?: AbortSignal) =>
    request.get<unknown, {count: number}>('/message/notifications/', {params: {status: 'unread', count_only: '1'}, signal});

// 标记单条通知已读
export const markRead = (id: string) => {
    return request.patch(`/message/notifications/${id}/`, { isRead: true });
};

// 删除单条通知
export const deleteNotification = (id: string) => {
    return request.delete(`/message/notifications/${id}/`);
};

// 恢复回收站通知
export const restoreNotification = (id: string) => {
    return request.patch(`/message/notifications/${id}/restore/`);
};

// 物理删除回收站通知
export const deleteNotificationPermanently = (id: string) => {
    return request.delete(`/message/notifications/${id}/permanent/`);
};

// 清空回收站
export const clearNotificationTrash = () => {
    return request.delete('/message/notifications/trash/');
};

// 标记所有通知已读
export const markAllRead = () => {
    return request.post('/message/notifications/');
};

// 随机抽取一条 Memos 生成系统通知
export const pushRandomMemoNotification = (schedule?: string) => {
    return request.post<unknown, NotificationItem | null>('/message/notifications/push_memo/', undefined,
        schedule ? {headers: {'Idempotency-Key': schedule}} : undefined);
};
