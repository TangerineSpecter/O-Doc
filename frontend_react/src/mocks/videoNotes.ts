import type {Article, ArticleNode} from '../types/api/article';
import type {VideoNoteJob} from '../types/api/videoNote';

interface LocalJob extends VideoNoteJob {
    collId: string;
    started: number;
    uploaded: boolean;
    editedContent?: string;
    articleDeleted?: boolean;
}

const key = 'odoc-local-video-jobs-v1';
const read = (): LocalJob[] => JSON.parse(sessionStorage.getItem(key) || '[]');
export const clearVideoNoteMockData = () => sessionStorage.removeItem(key);
const save = (jobs: LocalJob[]) => sessionStorage.setItem(key, JSON.stringify(jobs));

function progress(job: LocalJob): LocalJob {
    if (!['queued', 'running'].includes(job.state)) return job;
    const elapsed = Date.now() - job.started;
    if (elapsed < 1000) return job;
    if (elapsed < 3200) return {...job, state: 'running', stage: '整理笔记'};
    if (job.sourceUrl.includes('douyin.com') && !job.uploaded)
        return {...job, state: 'awaiting_upload', stage: '等待上传视频', message: '分享链接需要验证，可以上传视频继续。'};
    return {...job, state: 'completed', title: job.title || '数据透视表操作笔记', stage: '已完成',
        articleId: 'local-video-' + job.id, message: ''};
}

function finished(collId?: string | null) {
    return read().map(progress).filter(job => job.state === 'completed' && !job.articleDeleted && (!collId || job.collId === collId));
}

function toArticle(job: LocalJob): Article {
    return {id: 1, collId: job.collId, articleId: job.articleId, title: job.title,
        sourceUrl: job.sourceUrl, creationSource: 'video_note', contentFormat: 'markdown', author: 'admin', sort: 0, readCount: 0,
        isValid: true, permission: 'public', createdAt: job.createdAt, updatedAt: job.createdAt,
        content: job.editedContent ?? `[原视频](${job.sourceUrl})\n\n## 速读\n按月份比较销售额时，把月份放到行区域、销售额放到值区域。\n\n## 配置透视表\n00:32\n\n选中包含表头的数据区域，插入数据透视表，确认值字段的汇总方式为求和。`};
}

export const videoArticleRows = (collId?: string | null) => finished(collId).map(toArticle);
export const videoTreeNodes = (collId: string | null): ArticleNode[] => finished(collId).map(job => ({
    articleId: job.articleId, id: job.articleId, title: job.title, creationSource: 'video_note',
    contentFormat: 'markdown', type: 'doc', children: [],
}));

export async function resolveVideoNote(request: Request, state: string | null) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'DELETE' && path.startsWith('/api/article/delete/local-video-')) {
        const jobs = read().map(progress);
        const job = jobs.find(j => j.articleId && path === '/api/article/delete/' + j.articleId && !j.articleDeleted);
        if (!job) return Response.json({code: 404, msg: '笔记不存在'}, {status: 404});
        job.articleDeleted = true;
        save(jobs);
        return null;
    }
    if (request.method === 'GET' && path === '/api/article/annotations' &&
        url.searchParams.get('articleId')?.startsWith('local-video-')) {
        return {annotations: [], count: 0};
    }
    if (request.method === 'PUT' && path.startsWith('/api/article/update/local-video-')) {
        const jobs = read().map(progress);
        const job = jobs.find(j => j.articleId && !j.articleDeleted && path.endsWith('/' + j.articleId));
        if (!job) return Response.json({code: 404, msg: '笔记不存在'}, {status: 404});
        const patch = await request.json();
        if (typeof patch.content === 'string') job.editedContent = patch.content;
        if (typeof patch.title === 'string') job.title = patch.title;
        save(jobs);
        return toArticle(job);
    }
    if (path.startsWith('/api/article/detail/local-video-')) {
        const job = finished().find(j => path.endsWith('/' + j.articleId));
        return job ? toArticle(job) : Response.json({code: 404, msg: '笔记不存在'}, {status: 404});
    }
    if (!path.startsWith('/api/article/video-notes/jobs')) return undefined;
    if (state === 'error') return Response.json({code: 503, msg: '视频任务服务暂不可用'}, {status: 503});
    const jobs = read().map(progress);
    if (request.method === 'GET') return state === 'empty' ? [] : jobs.filter(j => j.collId === url.searchParams.get('collId'));
    if (path.endsWith('/jobs')) {
        const data = await request.json();
        const sourceUrl = data.shareText.replaceAll('\\://', '://').match(/https?:\/\/[^\s]+/)?.[0] || '';
        if (!/^https?:\/\/(?:www\.|m\.|v\.)?(?:bilibili\.com|douyin\.com|b23\.tv)\//.test(sourceUrl))
            return Response.json({code: 400, msg: '请粘贴 B 站或抖音视频链接'}, {status: 400});
        const existing = jobs.find(j => j.id === data.requestId);
        if (existing) return existing;
        const job: LocalJob = {id: data.requestId, collId: data.collId, state: 'queued', stage: '等待处理',
            sourceUrl, title: '', message: '', articleId: '', createdAt: new Date().toISOString(),
            started: Date.now(), uploaded: false};
        save([job, ...jobs]);
        return job;
    }
    const id = path.split('/').slice(-2)[0];
    const job = jobs.find(j => j.id === id);
    if (!job) return Response.json({code: 404, msg: '任务不存在'}, {status: 404});
    if (path.endsWith('/upload')) {
        const file = (await request.formData()).get('file');
        if (!(file instanceof File) || !file.size) return Response.json({code: 400, msg: '请选择视频文件'}, {status: 400});
        job.title = file.name.replace(/\.[^.]+$/, '');
        job.uploaded = true;
    }
    Object.assign(job, {state: 'queued', stage: '等待处理', message: '', started: Date.now()});
    save(jobs);
    return job;
}
