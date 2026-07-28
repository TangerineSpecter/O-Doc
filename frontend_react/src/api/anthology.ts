import request from '../utils/request';
import type { ArticleSummary, CreateAnthologyParams, Anthology } from '../types/api/anthology';

// 重新导出类型以便其他组件使用
export type { ArticleSummary, CreateAnthologyParams, Anthology };

// 创建文集接口
export const createAnthology = (data: CreateAnthologyParams) => {
    return request.post<any, Anthology>('/anthology/create', data);
};

// 获取文集列表接口
export const getAnthologyList = (type?: 'article' | 'image' | 'agent' | 'book') => {
    return request.get<any, Anthology[]>('/anthology/list', {
        params: { type }
    });
};

export interface BookItem {
    bookId: string; title: string; author: string; format: 'pdf' | 'txt' | 'epub' | 'mobi';
    size: number; formattedSize: string; coverUrl: string; localState: 'local' | 'cloud_only' | 'restoring';
    remoteAvailable: boolean; createdAt: string; progress: number; lastReadAt?: string | null; canRead: boolean;
}
export const getBooks = (collId: string) => request.get<any, BookItem[]>(`/anthology/${collId}/books`);
export const uploadBook = (collId: string, form: FormData) => request.post<any, {bookId: string}>(`/anthology/${collId}/books/upload`, form, {timeout: 0});
export const restoreBook = (bookId: string) => request.post<any, {localState: string}>(`/anthology/book/${bookId}/restore`);
export const releaseBook = (bookId: string) => request.post<any, {localState: string}>(`/anthology/book/${bookId}/release`);
export const deleteBook = (bookId: string) => request.delete<any, void>(`/anthology/book/${bookId}/delete`);
export const getBookProgress = (bookId: string) => request.get<any, {location: string; progress: number}>(`/anthology/book/${bookId}/progress`);
export const saveBookProgress = (bookId: string, payload: {location: string; progress: number}) => request.put<any, void>(`/anthology/book/${bookId}/progress`, payload);

// 新增：文集排序接口
export const sortAnthology = (collId: string, sort: number) => {
    return request.put<any, void>(`/anthology/${collId}/sort`, { sort });
};

// 新增：更新文集接口
export const updateAnthology = (collId: string, data: Partial<CreateAnthologyParams>) => {
    return request.put<any, Anthology>(`/anthology/update/${collId}`, data);
};

// 新增：删除文集接口
export const deleteAnthology = (collId: string) => {
    return request.delete<any, void>(`/anthology/delete/${collId}`);
};

// 新增：获取文集详情接口
export const getAnthologyDetail = (collId: string) => {
    return request.get<any, Anthology>(`/anthology/detail/${collId}`);
};
