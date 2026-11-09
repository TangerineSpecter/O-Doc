import type {NotificationItem} from '../types/api/message';
import {createRequestKey} from '../utils/requestKey';
import {randomLocalMemo} from './memos';

let notifications: NotificationItem[] = [];
const base = '/api/message/notifications/';

export function resolveNotificationRoute(request: Request, empty: boolean) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(base)) return undefined;
    const route = url.pathname.slice(base.length);
    const rows = empty ? [] : notifications;

    if (route === '' && request.method === 'GET') {
        const status = url.searchParams.get('status') || 'unread';
        const visible = rows.filter(row => status === 'deleted' ? row.isDeleted :
            !row.isDeleted && (status === 'all' || row.isRead === (status === 'read')));
        return url.searchParams.get('count_only') === '1' ? {count: visible.length} : visible;
    }
    if (route === '' && request.method === 'POST') {
        rows.filter(row => !row.isDeleted).forEach(row => { row.isRead = true; });
        return null;
    }
    if (route === 'push_memo/' && request.method === 'POST') {
        const memo = empty ? null : randomLocalMemo();
        if (!memo) return null;
        const row: NotificationItem = {
            id: createRequestKey(), title: memo.tag ? `Memos · ${memo.tag}` : 'Memos 定时推送',
            content: memo.content, type: 'info', link: '/memos', isRead: false,
            isDeleted: false, createdAt: new Date().toISOString(), deletedAt: null,
        };
        notifications.unshift(row);
        return row;
    }
    if (route === 'trash/' && request.method === 'DELETE') {
        if (!empty) notifications = rows.filter(row => !row.isDeleted);
        return null;
    }

    const match = /^([^/]+)\/(?:(restore|permanent)\/)?$/.exec(route);
    if (!match) return undefined;
    const row = rows.find(item => item.id === match[1]);
    const action = match[2];
    if (request.method === 'PATCH' && action === 'restore') {
        if (row?.isDeleted) Object.assign(row, {isDeleted: false, deletedAt: null});
    } else if (request.method === 'DELETE' && action === 'permanent') {
        if (row?.isDeleted) notifications = notifications.filter(item => item !== row);
    } else if (request.method === 'PATCH' && !action) {
        if (row && !row.isDeleted) row.isRead = true;
    } else if (request.method === 'DELETE' && !action) {
        if (row && !row.isDeleted) Object.assign(row, {isDeleted: true, deletedAt: new Date().toISOString()});
    } else {
        return undefined;
    }
    return null;
}
