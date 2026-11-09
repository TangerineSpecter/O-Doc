import {createRequestKey} from '../utils/requestKey';
import type {CreateMemoParams, MemoItem} from '../types/api/memo';

const now = new Date().toISOString();
let items: MemoItem[] = [
    {memoId: 'local-memo-1', content: '把今天的想法留在这里。\n\n灵感不一定要完整，先记录下来就很好。', tag: '生活/随想', isPinned: true, userName: '本地演示', createdAt: now, updatedAt: now},
    {memoId: 'local-memo-2', content: '## 读书笔记\n\n- 保持好奇\n- 多观察，也多提问', tag: '阅读', isPinned: false, userName: '本地演示', createdAt: now, updatedAt: now},
];

export function randomLocalMemo(): MemoItem | undefined {
    return items[Math.floor(Math.random() * items.length)];
}

export async function resolveMemoRoute(request: Request, empty: boolean) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/memo/')) return undefined;
    const route = path.slice('/api/memo/'.length);
    if (route === 'list' && request.method === 'GET') {
        const keyword = (url.searchParams.get('keyword') || '').toLowerCase();
        return (empty ? [] : items).filter(item => `${item.content} ${item.tag}`.toLowerCase().includes(keyword));
    }
    if (route === 'knowledge_graph' && request.method === 'GET') return {nodes: [], links: [], stats: {memoCount: 0, tagCount: 0, semanticLinkCount: 0}};
    if (route === 'sync_vectors' && request.method === 'POST') return {totalCount: items.length, syncedCount: items.length};
    if (route === 'create' && request.method === 'POST') {
        const data = await request.json() as CreateMemoParams;
        const item: MemoItem = {memoId: `local-${createRequestKey()}`, content: data.content, tag: data.tag || '', isPinned: !!data.isPinned, userName: '本地演示', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()};
        items = [item, ...items];
        return item;
    }
    const [action, id] = route.split('/');
    const index = items.findIndex(item => item.memoId === id);
    if (index < 0) return undefined;
    if (action === 'detail' && request.method === 'GET') return items[index];
    if (action === 'update' && request.method === 'PUT') {
        const data = await request.json() as Partial<CreateMemoParams>;
        items[index] = {...items[index], ...data, updatedAt: new Date().toISOString()};
        return items[index];
    }
    if (action === 'delete' && request.method === 'DELETE') {items = items.filter(item => item.memoId !== id); return null;}
    return undefined;
}
