import request from '../utils/request';

// 定义文章摘要类型
export interface ArticleSummary {
    articleId: string;
    title: string;
    date: string;
}

// 定义创建文集参数类型
export interface CreateAnthologyParams {
    title: string;
    description: string;
    iconId: string;
    permission: 'public' | 'private';
    isTop?: boolean;
    sort?: number;
}

// 定义文集返回数据类型
export interface Anthology {
    id: number;
    collId: string;
    title: string;
    count: number;
    iconId: string;
    isTop: boolean;
    description: string;
    articles: ArticleSummary[];
    permission: 'public' | 'private';
    sort?: number;
}

// 创建文集接口
export const createAnthology = (data: CreateAnthologyParams) => {
    return request.post<any, Anthology>('/anthology/create', data);
};

// 获取文集列表接口
export const getAnthologyList = () => {
    return request.get<any, Anthology[]>('/anthology/list');
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
