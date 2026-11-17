import type {NotificationItem, NotificationPage} from '../types/api/message';
import {createRequestKey} from '../utils/requestKey';
import {randomLocalMemo} from './memos';

let notifications: NotificationItem[] = [];
const base = '/api/message/notifications/';

export function addLocalNotification(input: Pick<NotificationItem, 'title' | 'content' | 'type' | 'link'>, id = createRequestKey()): NotificationItem {
    const row: NotificationItem = {...input, title: Array.from(input.title).slice(0, 100).join(''), id, isRead: false,
        isDeleted: false, createdAt: new Date().toISOString(), deletedAt: null};
    notifications.unshift(row);
    return row;
}

export function resolveNotificationRoute(request: Request, empty: boolean) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(base)) return undefined;
    const route = url.pathname.slice(base.length);
    const rows = empty ? [] : notifications;

    if (route === '' && request.method === 'GET') {
        const status = url.searchParams.get('status') || 'unread';
        const visible = rows.filter(row => status === 'deleted' ? row.isDeleted :
            !row.isDeleted && (status === 'all' || row.isRead === (status === 'read')));
        if (url.searchParams.get('count_only') === '1') return {count: visible.length};
        if (!url.searchParams.has('page')) return visible;
        const number = Number(url.searchParams.get('page'));
        const pages = Math.max(1, Math.ceil(visible.length / 30));
        const page = Number.isInteger(number) ? Math.min(pages, Math.max(1, number)) : 1;
        return {items: visible.slice((page - 1) * 30, page * 30), total: visible.length, page, pages} satisfies NotificationPage;
    }
    if (route === '' && request.method === 'POST') {
        rows.filter(row => !row.isDeleted).forEach(row => { row.isRead = true; });
        return null;
    }
    if (route === 'push_memo/' && request.method === 'POST') {
        const schedule = request.headers.get('Idempotency-Key');
        const id = schedule ? `local-schedule-${encodeURIComponent(schedule)}` : undefined;
        const existing = id && rows.find(row => row.id === id);
        if (existing) return existing;
        const memo = empty ? null : randomLocalMemo();
        if (!memo) return null;
        return addLocalNotification({
            title: memo.tag ? `Memos · ${memo.tag}` : 'Memos 定时推送',
            content: memo.content, type: 'info', link: '/memos',
        }, id);
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
