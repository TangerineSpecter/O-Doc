import request from '../utils/request';
import type {
    CreateMemoParams,
    MemoItem,
    MemoKnowledgeGraph,
    MemoKnowledgeGraphParams,
    MemoListParams,
    MemoVectorSyncResult
} from '../types/api/memo';

export type {CreateMemoParams, MemoItem, MemoKnowledgeGraph, MemoKnowledgeGraphParams, MemoListParams, MemoVectorSyncResult};

export const getMemoList = (params?: MemoListParams) => {
    return request.get<any, MemoItem[]>('/memo/list', {params});
};

export const getMemoKnowledgeGraph = (params?: MemoKnowledgeGraphParams) => {
    return request.get<any, MemoKnowledgeGraph>('/memo/knowledge_graph', {params});
};

export const syncMemoVectors = () => {
    return request.post<any, MemoVectorSyncResult>('/memo/sync_vectors');
};

export const createMemo = (data: CreateMemoParams) => {
    return request.post<any, MemoItem>('/memo/create', data);
};

export const updateMemo = (memoId: string, data: Partial<CreateMemoParams>) => {
    return request.put<any, MemoItem>(`/memo/update/${memoId}`, data);
};

export const deleteMemo = (memoId: string) => {
    return request.delete<any, void>(`/memo/delete/${memoId}`);
};
