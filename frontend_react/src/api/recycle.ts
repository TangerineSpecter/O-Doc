import request from '../utils/request';
import type {RecycleArticleItem, RecycleMemoItem} from '../types/api/recycle';

export const getArticleTrash = () => request.get<any, RecycleArticleItem[]>('/article/trash');
export const restoreArticleFromTrash = (articleId: string) =>
    request.post<any, void>(`/article/trash/${articleId}/restore`, {});
export const purgeArticleFromTrash = (articleId: string) =>
    request.delete<any, void>(`/article/trash/${articleId}`);

export const getMemoTrash = () => request.get<any, RecycleMemoItem[]>('/memo/trash');
export const restoreMemoFromTrash = (memoId: string) =>
    request.post<any, void>(`/memo/trash/${memoId}/restore`, {});
export const purgeMemoFromTrash = (memoId: string) =>
    request.delete<any, void>(`/memo/trash/${memoId}`);
