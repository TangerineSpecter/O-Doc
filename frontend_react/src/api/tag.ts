import request from '../utils/request';
import type { TagItem, CreateTagParams } from '../types/api/tag';

// 重新导出类型以便其他组件使用
export type { TagItem, CreateTagParams };


// 获取标签列表接口
export const getTagList = () => {
    return request.get<any, TagItem[]>('/tag/list');
};

// 创建标签接口
export const createTag = (data: CreateTagParams) => {
    return request.post<any, TagItem>('/tag/create', data);
};

// 更新标签接口
export const updateTag = (tagId: string, data: Partial<CreateTagParams>) => {
    return request.put<any, TagItem>(`/tag/update/${tagId}`, data);
};

// 删除标签接口
export const deleteTag = (tagId: string) => {
    return request.delete<any, void>(`/tag/delete/${tagId}`);
};


