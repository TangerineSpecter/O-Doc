import type {VideoASRStatus} from '../types/api/videoAsr';

export function clearVideoASRMockData() {
    sessionStorage.removeItem('odoc-local-video-asr-start');
}

export async function resolveVideoASR(request: Request, scenario: string | null): Promise<VideoASRStatus | Response | undefined> {
    if (new URL(request.url).pathname !== '/api/settings/video-asr-model/') return undefined;
    if (scenario === 'error') return Response.json({code: 503, msg: '读取模型状态失败'}, {status: 503});
    if (request.method === 'POST') sessionStorage.setItem('odoc-local-video-asr-start', String(Date.now()));
    const started = Number(sessionStorage.getItem('odoc-local-video-asr-start')) || 0;
    const elapsed = started ? Date.now() - started : 0;
    const state = !started || scenario === 'empty' ? 'missing' : elapsed < 3000 ? 'downloading' : elapsed < 6000 ? 'verifying' : 'ready';
    return {state, model: 'small', source: 'ModelScope 魔搭', totalBytes: 486212372,
        downloadedBytes: state === 'missing' ? 0 : Math.min(486212372, Math.round(elapsed / 3000 * 486212372)),
        canDownload: true, message: {missing: '模型尚未下载', downloading: '正在从魔搭下载模型',
            verifying: '下载完成，正在验证模型能否加载', ready: '已就绪，可以返回视频任务重试'}[state]};
}
