import request from '../utils/request';
import type { NotificationItem, NotificationStatus } from '../types/api/message';

// 重新导出类型以便其他组件使用
export type { NotificationItem, NotificationStatus };

// 获取通知列表
export const getNotifications = (status: NotificationStatus = 'unread') => {
    return request.get<any, NotificationItem[]>('/message/notifications/', { params: { status } });
};

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
export const pushRandomMemoNotification = () => {
    return request.post<any, NotificationItem | null>('/message/notifications/push_memo/');
};
