import request from '../utils/request';
import { getArticles } from './article';

// 定义标签项类型
export interface TagItem {
    tag_id: string;
    name: string;
    article_count: number;
    themeId: string;
}

// 定义创建标签参数类型
export interface CreateTagParams {
    name: string;
    themeId: string;
}

// 定义文章项类型
export interface ArticleItem {
    id: string;
    title: string;
    desc: string;
    date: string;
    readTime: number;
    tags: string[];
    collId: string;
    collection?: boolean;
}

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


