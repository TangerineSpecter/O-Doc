import { diagnosticReader, diagnosticFetch } from '@/utils/diagnostics';
import request from '../utils/request';
import {getAuthToken} from '../utils/authStorage';
import type {BiographyDetail, BiographyOutline, BiographyResult, BookAnalysisStatus, BookInspection, ChapterGuide, ExecutionPage, GraphFilters, PagedChapters, ReadingGraph, ReadingMode, ReadingNode, ReadingRun, SourceEvidence} from '../types/bookAnalysis';

const base = (bookId: string) => `/book-analysis/books/${encodeURIComponent(bookId)}`;
export const getBookAnalysis = (id: string, signal?: AbortSignal, revisionId = '') => request.get<never, BookAnalysisStatus>(base(id), {signal, params: {revisionId}});
export const inspectBook = (id: string) => request.post<never, BookInspection>(`${base(id)}/inspect`, {}, {timeout: 0});
export const getBookChapters = (id: string, page = 1, signal?: AbortSignal, revisionId = '') => request.get<never, PagedChapters>(`${base(id)}/chapters`, {params: {page, limit: 50, revisionId}, signal});
export const getChapterGuide = (id: string, chapterId: string, signal?: AbortSignal, revisionId = '') => request.get<never, ChapterGuide>(`${base(id)}/chapters/${chapterId}`, {signal, params: {revisionId}});
export const getReadingGraph = (id: string, filters: GraphFilters, signal?: AbortSignal) => request.get<never, ReadingGraph>(`${base(id)}/graph`, {params: filters, signal});
export const getBiography = (id: string, params: {revisionId: string; chapterId?: string; throughChapter?: number; page: number}, signal?: AbortSignal) => request.get<never, BiographyResult>(`${base(id)}/biography`, {params, signal});
export const getBiographyDetail = (id: string, params: {revisionId: string; chapterId: string; targetId: string; targetKind: 'event' | 'claim' | 'quote'; throughChapter?: number}, signal?: AbortSignal) => request.get<never, BiographyDetail>(`${base(id)}/biography/detail`, {params, signal});
export const getBiographyOutline = (id: string, params: {revisionId: string; throughChapter?: number}, signal?: AbortSignal) => request.get<never, BiographyOutline>(`${base(id)}/biography/outline`, {params, signal});
export const getReadingNode = (id: string, nodeId: string, page = 1, signal?: AbortSignal, revisionId = '', throughChapter?: number) => request.get<never, {node: ReadingNode; neighbors: ReadingGraph}>(`${base(id)}/nodes/${nodeId}`, {params: {page, revisionId, throughChapter}, signal});
export const startBookRun = (id: string, mode: ReadingMode, start: number, end: number, force = false, kind = 'analyze', subjectName = '') => request.post<never, ReadingRun>(`${base(id)}/runs`, {mode, start, end, force, kind, subjectName});
export const runBookAction = (id: string, runId: string, action: 'cancel' | 'retry') => request.post<never, ReadingRun>(`${base(id)}/runs/${runId}/${action}`);
export const getExecutionEvents = (id: string, runId: string, before: number, signal?: AbortSignal) => request.get<never, ExecutionPage>(`${base(id)}/runs/${runId}/events`, {params: {before}, signal});
export const correctReadingProfile = (id: string, nodeId: string, attribute: 'identity' | 'age' | 'occupation' | 'role' | 'trait' | 'background' | 'behavior' | 'goal', value: string, timeLabel = '') => request.post(`${base(id)}/nodes/${nodeId}/profile`, {attribute, value, timeLabel});
export const correctReadingNode = (id: string, nodeId: string, patch: {name?: string; description?: string; aliases?: string[]; mergeInto?: string}) => request.patch(`${base(id)}/nodes/${nodeId}/correction`, patch);
export const addReadingRelation = (id: string, source: string, target: string, kind: string, label: string) => request.post(`${base(id)}/relations`, {source, target, kind, label});
export const correctReadingRelation = (id: string, edgeId: string, kind: string, label: string) => request.patch(`${base(id)}/relations/${edgeId}`, {kind, label});
export const removeReadingRelation = (id: string, edgeId: string) => request.delete(`${base(id)}/relations/${edgeId}`);
export const changeChapterBoundary = (id: string, chapterId: string, action: 'rename' | 'split' | 'merge' | 'remove', title = '', offset = 0) => request.patch(`${base(id)}/chapters/${chapterId}/boundary`, {action, title, offset});

export function readingError(error: unknown): string {
    if (typeof error === 'object' && error && 'response' in error) {
        const response = error.response as {data?: {msg?: string}};
        if (response?.data?.msg) return response.data.msg;
    }
    return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

export interface AskCallbacks {onAnswer: (text: string) => void; onSources: (sources: SourceEvidence[], method: string) => void}
export async function askBook(id: string, question: string, chapterId: string, nodeId: string, signal: AbortSignal, callbacks: AskCallbacks, revisionId = '', throughChapter?: number): Promise<void> {
    const token = getAuthToken();
    const response = await diagnosticFetch(`/api${base(id)}/ask`, {method: 'POST', headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Token ${token}`} : {})}, body: JSON.stringify({question, ...(chapterId ? {chapterId} : {}), ...(nodeId ? {nodeId} : {}), revisionId, throughChapter}), signal});
    if (!response.ok) {
        const result = await response.json().catch(() => ({})) as {msg?: string};
        throw new Error(result.msg || '问答请求失败');
    }
    if (!response.body) throw new Error('当前浏览器不支持流式回答');
    const reader = diagnosticReader(response)!;
    const decoder = new TextDecoder();
    let buffer = '', complete = false;
    const consume = (frame: string) => {
        const lines = frame.split('\n');
        const name = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!name || !data) return;
        const payload = JSON.parse(data) as {content?: string; message?: string; sources?: SourceEvidence[]; method?: string};
        if (name === 'answer' && typeof payload.content === 'string') callbacks.onAnswer(payload.content);
        if (name === 'sources' && Array.isArray(payload.sources)) callbacks.onSources(payload.sources, payload.method || 'keyword');
        if (name === 'error') throw new Error(payload.message || 'AI 回答失败');
        if (name === 'done') complete = true;
    };
    try {
        while (true) {
            const result = await reader.read();
            buffer += decoder.decode(result.value, {stream: !result.done}).replace(/\r\n/g, '\n');
            let boundary = buffer.indexOf('\n\n');
            while (boundary >= 0) {
                consume(buffer.slice(0, boundary));
                buffer = buffer.slice(boundary + 2);
                boundary = buffer.indexOf('\n\n');
            }
            if (result.done || complete) break;
        }
        if (buffer.trim()) consume(buffer);
        if (!complete) throw new Error('回答连接中断，可以重试');
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
