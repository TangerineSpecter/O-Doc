import {resolveMemoRoute} from './memos';
import {resolvePerformanceRoute} from './performance';
import type {PendingArticleIllustration} from '../types/api/prompt';
import {resolveDiaryRoute} from './diary';
import {delay, http, HttpResponse} from 'msw';
import {resolveLocalRoute} from './agentWorld/routes';
import {resolveQuantRoute} from './quant/routes';
import {resolveImageGalleryRoute} from './imageGallery/groupRoutes';
import {resolveNovelReaderRoute} from './novel/readerRoutes';
import {analyticsTiming} from './agentWorld/analyticsTiming';
import {resolveModelSettingsRoute} from './modelSettings';
import packageJson from '../../package.json' with {type: 'json'};

export const localHandlers = [
    http.get('/api/prompt/article-illustration/pending', () => HttpResponse.json({code: 200, msg: '本地样例', data: [] satisfies PendingArticleIllustration[]})),
    http.get('https://api.github.com/repos/TangerineSpecter/O-Doc/tags', () => HttpResponse.json([{name: `v${packageJson.version}`, commit: {sha: '0'.repeat(40)}}])),
    http.all('/api/*', async ({request}) => {
        const state = new URLSearchParams(location.search).get('mockState');
        const archivedDetail = new URL(request.url).pathname === '/api/settings/agent-world/combat/explorations/local-exploration/';
        if (state === 'archived-slow' && archivedDetail) await delay(1800);
        if (state === 'archived-error' && archivedDetail) {
            return HttpResponse.json({code: 503, msg: '本地模拟探索记录加载失败', data: null}, {status: 503});
        }
        if (state === 'slow') await delay(new URL(request.url).pathname === '/api/maintenance/overview' ? 3600 : 1800);
        if (state === 'error' && (new URL(request.url).pathname === '/api/settings/agent-relations/' || new URL(request.url).pathname.startsWith('/api/message/notifications/') || new URL(request.url).pathname === '/api/settings/config/get_memos_push_config/' || new URL(request.url).pathname.startsWith('/api/settings/providers/') || new URL(request.url).pathname.startsWith('/api/settings/models/') || new URL(request.url).pathname.startsWith('/api/diary/') || new URL(request.url).pathname.startsWith('/api/memo/') || (new URL(request.url).pathname.startsWith('/api/resource/') && new URL(request.url).pathname !== '/api/resource/list') || new URL(request.url).pathname.startsWith('/api/settings/agent-world/') || new URL(request.url).pathname.startsWith('/api/quant/') || new URL(request.url).pathname.startsWith('/api/anthology/') || new URL(request.url).pathname.startsWith('/api/novel/') || new URL(request.url).pathname.startsWith('/api/article/image/') || new URL(request.url).pathname === '/api/settings/locations/' || new URL(request.url).pathname === '/api/article/list')) {
            return HttpResponse.json({code: 503, msg: '本地模拟接口失败，可切回样例状态重试', data: null}, {status: 503});
        }
        const performanceData = await resolvePerformanceRoute(request.clone(), state);
        if (performanceData instanceof Response) return performanceData;
        if (performanceData !== undefined) return HttpResponse.json({code: 200, msg: '本地样例', data: performanceData});
        const modelData = await resolveModelSettingsRoute(request.clone(), state === 'empty');
        if (modelData instanceof Response) return modelData;
        if (modelData !== undefined) return HttpResponse.json({code: 200, msg: '本地样例', data: modelData});
        const memoData = await resolveMemoRoute(request.clone(), state === 'empty');
        if (memoData instanceof Response) return memoData;
        if (memoData !== undefined) return HttpResponse.json({code: 200, msg: '本地样例', data: memoData});
        const diaryData = await resolveDiaryRoute(request.clone(), state === 'empty');
        if (diaryData instanceof Response) return diaryData;
        if (diaryData !== undefined) return HttpResponse.json({code: 200, msg: '本地样例', data: diaryData});
        const quantData = await resolveQuantRoute(request.clone());
        const imageData = quantData === undefined ? await resolveImageGalleryRoute(request.clone(), state === 'empty') : undefined;
        const novelData = quantData === undefined && imageData === undefined ? await resolveNovelReaderRoute(request.clone(), state === 'empty') : undefined;
        const data = quantData !== undefined ? quantData : imageData !== undefined ? imageData : novelData !== undefined ? novelData : await resolveLocalRoute(request);
        if (data instanceof Response) return data;
        if (data === undefined) return;
        if (['/api/settings/agent-world/token-usage/export/', '/api/settings/agent-world/token-usage/observation-export/'].includes(new URL(request.url).pathname)) {
            return HttpResponse.json(data, {headers: {'Content-Disposition': 'attachment; filename="local-token-report.json"', 'Cache-Control': 'no-store'}});
        }
        if (new URL(request.url).pathname === '/api/settings/agent-world/analytics/') {
            return HttpResponse.json({code: 200, msg: '本地样例', data}, {headers: {'Server-Timing': analyticsTiming}});
        }
        return HttpResponse.json({code: 200, msg: '本地样例', data});
    }),
];

// Fail closed: a missing mock must never reach a running real backend.
export const unhandledLocalApi = http.all('/api/*', ({request}) => HttpResponse.json({
    code: 501, msg: `尚未提供本地样例: ${request.method} ${new URL(request.url).pathname}`, data: null,
}, {status: 501}));
