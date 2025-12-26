import request from '../utils/request';
import type { NotificationItem } from '../types/api/message';

// 重新导出类型以便其他组件使用
export type { NotificationItem };

// 获取通知列表
export const getNotifications = () => {
    return request.get<any, NotificationItem[]>('/message/notifications/');
};

// 标记单条通知已读
export const markRead = (id: number) => {
    return request.patch(`/message/notifications/${id}/`, { is_read: true });
};

// 标记所有通知已读
export const markAllRead = () => {
    return request.post('/message/notifications/mark_all_read/');
};