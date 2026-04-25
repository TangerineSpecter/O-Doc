import request from '../utils/request';
import type {CreateMemoParams, MemoItem, MemoListParams} from '../types/api/memo';

export type {CreateMemoParams, MemoItem, MemoListParams};

export const getMemoList = (params?: MemoListParams) => {
    return request.get<any, MemoItem[]>('/memo/list', {params});
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
