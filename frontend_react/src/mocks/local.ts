import {delay, http, HttpResponse} from 'msw';
import {resolveLocalRoute} from './agentWorld/routes';
import {resolveQuantRoute} from './quant/routes';
import packageJson from '../../package.json';

export const localHandlers = [
    http.get('https://api.github.com/repos/TangerineSpecter/O-Doc/tags', () => HttpResponse.json([{name: `v${packageJson.version}`, commit: {sha: '0'.repeat(40)}}])),
    http.all('/api/*', async ({request}) => {
        const state = new URLSearchParams(location.search).get('mockState');
        if (state === 'slow') await delay(1800);
        if (state === 'error' && (new URL(request.url).pathname.startsWith('/api/settings/agent-world/') || new URL(request.url).pathname.startsWith('/api/quant/') || new URL(request.url).pathname.startsWith('/api/anthology/'))) {
            return HttpResponse.json({code: 503, msg: '本地模拟接口失败，可切回样例状态重试', data: null}, {status: 503});
        }
        const quantData = await resolveQuantRoute(request.clone());
        const data = quantData === undefined ? await resolveLocalRoute(request) : quantData;
        if (data instanceof Response) return data;
        if (data === undefined) return;
        if (new URL(request.url).pathname === '/api/settings/agent-world/token-usage/export/') {
            return HttpResponse.json(data, {headers: {'Content-Disposition': 'attachment; filename="local-token-report.json"', 'Cache-Control': 'no-store'}});
        }
        return HttpResponse.json({code: 200, msg: '本地样例', data});
    }),
];

// Fail closed: a missing mock must never reach a running real backend.
export const unhandledLocalApi = http.all('/api/*', ({request}) => HttpResponse.json({
    code: 501, msg: `尚未提供本地样例: ${request.method} ${new URL(request.url).pathname}`, data: null,
}, {status: 501}));
