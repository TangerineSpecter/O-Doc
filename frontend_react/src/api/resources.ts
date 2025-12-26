import request from '../utils/request';
import type { 
    ArticleSource, 
    ResourceItem, 
    GetResourcesParams, 
    ResourceUploadResponse, 
    FormattedSize, 
    ResourceListResponse 
} from '../types/api/resources';

// 重新导出类型以便其他组件使用
export type { 
    ArticleSource, 
    ResourceItem, 
    GetResourcesParams, 
    ResourceUploadResponse, 
    FormattedSize, 
    ResourceListResponse 
};

// 获取资源列表接口
export const getResources = (params: GetResourcesParams) => {
    return request.get<any, ResourceListResponse>('/resource/list', {params});
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
    return request.get<any, Blob>(`/resource/download/${resourceId}`, {responseType: 'blob'});
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
