import request from '../utils/request';
import type { ArticleSummary, CreateAnthologyParams, Anthology } from '../types/api/anthology';

// 重新导出类型以便其他组件使用
export type { ArticleSummary, CreateAnthologyParams, Anthology };

// 创建文集接口
export const createAnthology = (data: CreateAnthologyParams) => {
    return request.post<any, Anthology>('/anthology/create', data);
};

// 获取文集列表接口
export const getAnthologyList = (type?: 'article' | 'image' | 'agent') => {
    return request.get<any, Anthology[]>('/anthology/list', {
        params: { type }
    });
};

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
