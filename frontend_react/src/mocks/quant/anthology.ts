import {HttpResponse} from 'msw';
import homepageFixtures from '../homepageDemoData.json' with {type: 'json'};
import type {Anthology, AnthologyType, CreateAnthologyParams} from '../../types/api/anthology';
import type {MaintenanceOverview} from '../../types/api/maintenance';
import {mockScenario, persistQuantState, quantId, quantState} from './state';
import {quantCollectionId} from './fixtures';

const originalCollections: Anthology[] = homepageFixtures.map(row => ({...row, type: 'article' as const, permission: row.permission === 'private' ? 'private' : 'public', isTop: Boolean(row.isTop)}));
const fail = (status: number, msg: string) => HttpResponse.json({code: status, msg, data: null}, {status});
const allowedTypes: AnthologyType[] = ['article', 'image', 'agent', 'book', 'learning', 'novel', 'quant', 'backtest'];
const owner = (request: Request) => Boolean(request.headers.get('Authorization'));

export async function resolveQuantAnthology(request: Request): Promise<unknown> {
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
    if (path === '/api/maintenance/overview') {
        return {review: {date: '2026-10-22', total: 0, handled: 0, pending: 0, streak: 0, leadItem: null}, health: {score: 100, status: '良好', severityCounts: {critical: 0, warning: 0, info: 0}, total: 0}} satisfies MaintenanceOverview;
    }
    if (!path.startsWith('/api/anthology/')) return undefined;
    // Preserve the dedicated Agent-world fixtures and their richer detail shape.
    if (url.searchParams.get('type') === 'agent' || path.endsWith('/local-world')) return undefined;
    const state = quantState();
    const existing = mockScenario() === 'empty' ? [] : originalCollections;
    const collections = [...state.collections, ...existing.filter(row => !state.collections.some(saved => saved.collId === row.collId))].filter(row => !state.removedCollectionIds.includes(row.collId));
    if (path === '/api/anthology/list') {
        persistQuantState();
        const type = url.searchParams.get('type');
        return collections.filter(row => (owner(request) || row.permission === 'public') && (!type || row.type === type) && (mockScenario() !== 'empty' || row.collId !== quantCollectionId || row.count > 0));
    }
    const detail = path.match(/^\/api\/anthology\/detail\/([^/]+)$/);
    if (detail) {
        const row = collections.find(item => item.collId === decodeURIComponent(detail[1]));
        if (!row || (row.permission === 'private' && !owner(request))) return fail(404, '文集不存在或无权访问');
        persistQuantState();
        return row;
    }
    if (!owner(request)) return fail(403, '请先登录后管理文集');
    const writing = !['GET', 'HEAD', 'DELETE'].includes(request.method);
    const rawBody = writing ? await request.text() : '';
    const body: Partial<CreateAnthologyParams> = rawBody ? JSON.parse(rawBody) as Partial<CreateAnthologyParams> : {};
    if (path === '/api/anthology/create' && request.method === 'POST') {
        if (!body.title?.trim() && body.type !== 'novel') return fail(400, '请填写文集名称');
        const type = allowedTypes.includes(body.type as AnthologyType) ? body.type! : 'article';
        const row: Anthology = {collId: quantId('collection'), title: body.title || '未命名小说', description: body.description || '', iconId: body.iconId || 'book', type, permission: type === 'quant' || type === 'learning' || type === 'backtest' ? 'private' : body.permission || 'public', isTop: Boolean(body.isTop), sort: body.sort || 0, hideCoverContent: body.hideCoverContent || false, count: 0, articles: [], userId: 'local-user', canManage: true, updatedAt: new Date().toISOString()};
        state.collections.push(row); persistQuantState(); return row;
    }
    const mutate = path.match(/^\/api\/anthology\/(update|delete)\/([^/]+)$/);
    const sort = path.match(/^\/api\/anthology\/([^/]+)\/sort$/);
    if (mutate || sort) {
        const id = decodeURIComponent(mutate?.[2] || sort![1]);
        const row = collections.find(item => item.collId === id);
        if (!row) return fail(404, '文集不存在');
        if (mutate?.[1] === 'delete' && request.method === 'DELETE') {
            state.collections = state.collections.filter(item => item.collId !== id);
            state.removedCollectionIds.push(id);
            state.entries.filter(item => item.collId === id).forEach(item => {item.isValid = false;});
            persistQuantState(); return null;
        }
        if ((['quant', 'backtest'].includes(row.type || '') || ['quant', 'backtest'].includes(body.type || '')) && body.type && row.type !== body.type) return fail(400, '量化及回测文集不能与其他类型互转');
        Object.assign(row, body, {collId: row.collId, permission: row.type === 'quant' || row.type === 'learning' || row.type === 'backtest' ? 'private' : body.permission || row.permission, updatedAt: new Date().toISOString()});
        if (!state.collections.some(item => item.collId === id)) state.collections.push(row);
        persistQuantState(); return row;
    }
    return undefined;
}
