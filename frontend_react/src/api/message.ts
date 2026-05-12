import request from '../utils/request';
import type { NotificationItem } from '../types/api/message';

// 重新导出类型以便其他组件使用
export type { NotificationItem };

// 获取通知列表
export const getNotifications = () => {
    return request.get<any, NotificationItem[]>('/message/notifications/');
};

// 标记单条通知已读
export const markRead = (id: string) => {
    return request.patch(`/message/notifications/${id}/`, { isRead: true });
};

// 删除单条通知
export const deleteNotification = (id: string) => {
    return request.delete(`/message/notifications/${id}/`);
};

// 标记所有通知已读
export const markAllRead = () => {
    return request.post('/message/notifications/');
};

// 随机抽取一条 Memos 生成系统通知
export const pushRandomMemoNotification = () => {
    return request.post<any, NotificationItem | null>('/message/notifications/push_memo/');
};
