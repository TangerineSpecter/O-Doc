import type {Article, ArticleNode, CreateArticleParams, SaveWebpageResult} from '../types/api/article';
import {createRequestKey} from '../utils/requestKey';

const created: Article[] = [];
const html = '<!doctype html><html lang="zh-CN"><body><h1>网页导入样例</h1><p>这是原样 HTML 预览。</p></body></html>';
const failure = (msg: string) => Response.json({code: 400, msg, data: null}, {status: 400});

export const createdRows = (collId: string | null) => created.filter(a => !collId || a.collId === collId);
export const createdNodes = (collId: string | null): ArticleNode[] => createdRows(collId).map(a => ({
    articleId: a.articleId, id: a.articleId, title: a.title, type: 'doc', children: [],
    creationSource: a.creationSource, contentFormat: a.contentFormat,
}));

export async function resolveCreatedArticle(request: Request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const id = path.split('/').pop();
    const existing = created.find(article => article.articleId === id);
    if (existing) {
        if (path === '/api/article/detail/' + id) return existing;
        if (path === '/api/article/delete/' + id && request.method === 'DELETE') {
            created.splice(created.indexOf(existing), 1);
            return null;
        }
        if (path === '/api/article/html-delete-summary/' + id) return {exclusiveCount: 0, sharedCount: 0};
        if (path === '/api/article/html-convert/' + id && request.method === 'POST') {
            const copy: Article = {...existing, articleId: 'local-created-' + createRequestKey(),
                title: existing.title + '（可编辑副本）', contentFormat: 'markdown', canEditContent: true, canAnnotate: true};
            created.unshift(copy);
            return copy;
        }
        if (path === '/api/article/html-preview/' + id) return new Response(html, {headers: {'Content-Type': 'text/html'}});
        if (path === '/api/article/update/' + id && request.method === 'PUT') {
            const body = await request.json();
            if (typeof body.title === 'string') existing.title = body.title;
            if (typeof body.content === 'string') existing.content = body.content;
            return existing;
        }
    }
    if (request.method === 'GET' && path === '/api/article/annotations' &&
        created.some(a => a.articleId === url.searchParams.get('articleId'))) return {annotations: [], count: 0};
    if (request.method !== 'POST' || !['/api/article/create', '/api/article/save-web/', '/api/article/import-file/'].includes(path)) return undefined;
    const fileImport = path.endsWith('/import-file/');
    const manual = path.endsWith('/create');
    const form = fileImport ? await request.formData() : undefined;
    const body = fileImport ? undefined : await request.json() as CreateArticleParams & {url?: string};
    const file = form?.get('file');
    if (fileImport && !(file instanceof File)) return failure('请选择导入文件');
    const collId = String(form?.get('collId') || body?.collId || '');
    if (!collId) return failure('请选择文章文集');
    const original = form?.get('importMode') === 'original';
    const now = new Date().toISOString();
    const article: Article = {
        id: created.length + 1, articleId: 'local-created-' + createRequestKey(), collId,
        title: body?.title || (file instanceof File ? file.name : '网页导入样例'),
        content: body?.content ?? '## 网页导入样例\n\n本地导入的正文。',
        creationSource: manual ? 'manual' : 'imported', contentFormat: original ? 'html' : 'markdown',
        canEditContent: !original, canAnnotate: !original, sourceUrl: body?.url,
        author: 'admin', createdAt: now, updatedAt: now, isValid: true,
        permission: body?.permission || 'public', readCount: 0, sort: 0,
    };
    created.unshift(article);
    if (manual) return article;
    const result: SaveWebpageResult = {...article, importReport: {
        extractionMode: 'standard', confidence: 'high', localizedImageCount: 0, externalImageCount: 0, warnings: [],
    }};
    return original ? {articles: [result]} : result;
}
