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
    duplicate?: boolean; // 标记是否为重复文件
    sourceType?: string; // 资源来源类型：attachment(附件)、content(内容)
}

// 定义获取资源列表参数类型
export interface GetResourcesParams {
    type?: string;
    searchQuery?: string;
    linked?: boolean;
    page?: number;
    pageSize?: number;
}

// 定义资源上传响应类型
export interface ResourceUploadResponse {
    id: string;
    name: string;
    type: string;
    size: string;
    date: string;
    linked: boolean;
    sourceArticle: ArticleSource | null;
    duplicate?: boolean;
    sourceType?: string; // 资源来源类型
}

export interface ResourceListResponse {
    list: ResourceItem[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
}

// 获取资源列表接口
export const getResources = (params: GetResourcesParams) => {
    return request.get<any, ResourceListResponse>('/resource/list', { params });
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

// 上传资源接口
export const uploadResource = (file: File, sourceType: string = 'content') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_type', sourceType);
    return request.post<any, ResourceUploadResponse>('/resource/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
};
