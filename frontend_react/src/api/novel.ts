import request from '../utils/request';
import type {Novel, Chapter, Revision, Run, RunKind, Resource, ReaderBook, Memory} from '../types/api/novel';

const root = (id: string) => `/novel/${encodeURIComponent(id)}/`;
export const novelApi = {
    get: (id: string) => request.get<never, Novel>(root(id)),
    patch: (id: string, data: Record<string, unknown>) => request.patch<never, Novel>(root(id), data),
    models: () => request.get<never, {id: string; name: string; displayName: string}[]>('/novel/models/'),
    resource: (id: string, resource: Resource, data: Record<string, unknown>, recordId?: string) => request.post<never, Novel>(`${root(id)}${resource}/${recordId ? recordId + '/' : ''}`, data),
    remove: (id: string, resource: Resource, recordId: string) => request.delete<never, Novel>(`${root(id)}${resource}/${recordId}/`),
    chapter: (id: string, cid: string) => request.get<never, Chapter>(`${root(id)}chapters/${cid}/`),
    save: (id: string, data: Record<string, unknown>, cid?: string) => request.post<never, Chapter>(`${root(id)}chapters/${cid ? cid + '/' : ''}`, data),
    deleteChapter: (id: string, cid: string) => request.delete(`${root(id)}chapters/${cid}/`),
    action: (id: string, cid: string, action: string, data: Record<string, unknown>) => request.post<never, Chapter>(`${root(id)}chapters/${cid}/${action}/`, data),
    revision: (id: string, rid: string) => request.get<never, Revision>(`${root(id)}revisions/${rid}/`),
    run: (id: string, kind: RunKind, data: Record<string, unknown>) => request.post<never, Run>(`${root(id)}runs/`, {kind, requestKey: crypto.randomUUID(), ...data}),
    poll: (id: string, rid: string) => request.get<never, Run>(`${root(id)}runs/${rid}/`),
    runAction: (id: string, rid: string, action: string) => request.post<never, Run | Novel>(`${root(id)}runs/${rid}/${action}/`, {requestKey: crypto.randomUUID()}),
    memory: (id: string, through?: number) => request.get<never, Memory>(`${root(id)}memory/`, {params: {through}}),
    read: (id: string, cid?: string) => request.get<never, ReaderBook>(`${root(id)}read/${cid ? cid + '/' : ''}`),
    export: (id: string, version: string, format: string) => request.get<never, {title: string; content: string}>(`${root(id)}export/`, {params: {version, fileType: format}}),
};
