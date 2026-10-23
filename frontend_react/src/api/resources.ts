import request from '../utils/request';
import type { 
    ArticleSource, 
    BookSource,
    PromptSource,
    ResourceItem, 
    GetResourcesParams, 
    ResourceUploadResponse, 
    FormattedSize, 
    ResourceListResponse 
} from '../types/api/resources';

// 重新导出类型以便其他组件使用
export type { 
    ArticleSource, 
    BookSource,
    PromptSource,
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

// 删除资源接口
export const deleteResource = (resourceId: string) => {
    return request.delete<any, void>(`/resource/delete/${resourceId}`);
};

// 下载资源接口
export const downloadResource = (resourceId: string, signal?: AbortSignal) => {
    return request.get<any, Blob>(`/resource/download/${resourceId}`, {responseType: 'blob', signal});
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
