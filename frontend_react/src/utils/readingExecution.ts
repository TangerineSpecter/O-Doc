import type {ReadingExecutionEvent, ReadingRun} from '../types/bookAnalysis';

export const runLabels: Record<ReadingRun['state'], string> = {queued: '等待执行', running: '正在执行', completed: '已完成', failed: '执行失败', cancelled: '已停止'};
export const phaseLabels: Record<string, string> = {extract: '分段抽取', chapter_summary: '章节导读', book_summary: '范围总结', index: '原文检索'};
export const modelRoles: Record<string, string> = {simple: '简易模型', default: '主对话模型', embedding: '向量模型'};

export function executionDuration(seconds: number): string {
    const value = Math.max(0, Math.floor(seconds));
    return value < 60 ? `${value} 秒` : `${Math.floor(value / 60)} 分 ${value % 60} 秒`;
}

export function pendingModelRequest(run: ReadingRun): ReadingExecutionEvent | undefined {
    if (run.state !== 'running') return;
    const events = run.events || [];
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event.kind === 'worker_claimed' || event.kind === 'worker_recovered') return;
        if (event.kind !== 'model_request_started') continue;
        const id = event.details.requestId;
        if (events.slice(i + 1).some(e => e.details.requestId === id && (e.kind === 'model_response' || e.kind === 'model_request_failed'))) return;
        return event;
    }
}

export function mergeExecutionEvents(...groups: ReadingExecutionEvent[][]): ReadingExecutionEvent[] {
    const events = new Map<number, ReadingExecutionEvent>();
    groups.flat().forEach(event => events.set(event.id, event));
    return [...events.values()].sort((a, b) => a.id - b.id);
}

export function modelOutputProgress(events: ReadingExecutionEvent[], request?: ReadingExecutionEvent): ReadingExecutionEvent | undefined {
    if (!request) return;
    const progress = events.filter(event => event.details.requestId === request.details.requestId && (event.kind === 'model_first_output' || event.kind === 'model_progress'));
    return progress[progress.length - 1];
}
