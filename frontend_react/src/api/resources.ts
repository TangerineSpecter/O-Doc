import request from '../utils/request';

// 定义文章来源类型
export interface ArticleSource {
    id: string;
    title: string;
}

// 定义资源项类型
export interface ResourceItem {
    id: string;
    name: string;
    type: string;
    size: string;
    date: string;
    linked: boolean;
    sourceArticle: ArticleSource | null;
}

// 定义获取资源列表参数类型
export interface GetResourcesParams {
    type?: string;
    searchQuery?: string;
    linked?: boolean;
    page?: number;
    pageSize?: number;
}

// 获取资源列表接口
export const getResources = (params: GetResourcesParams) => {
    return request.get<any, ResourceItem[]>('/resource/list', { params });
};

// 创建资源接口
export const createResource = (data: Partial<ResourceItem>) => {
    return request.post<any, ResourceItem>('/resource/create', data);
};

// 更新资源接口
export const updateResource = (resourceId: string, data: Partial<ResourceItem>) => {
    return request.put<any, ResourceItem>(`/resource/update/${resourceId}`, data);
};

// 删除资源接口
export const deleteResource = (resourceId: string) => {
    return request.delete<any, void>(`/resource/delete/${resourceId}`);
};

// 下载资源接口
export const downloadResource = (resourceId: string) => {
    return request.get<any, Blob>(`/resource/download/${resourceId}`, { responseType: 'blob' });
};
