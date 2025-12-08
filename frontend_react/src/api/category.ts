import request from '../utils/request';
import { getArticles } from './article';

// 定义分类项类型
export interface CategoryItem {
    id: string;
    name: string;
    count: number;
    description: string;
    iconKey: string;
    themeId: string;
    isSystem?: boolean;
}

// 定义创建分类参数类型
export interface CreateCategoryParams {
    name: string;
    description: string;
    themeId: string;
    iconKey: string;
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
}

// 获取分类列表接口
export const getCategoryList = () => {
    return request.get<any, CategoryItem[]>('/category/list');
};

// 创建分类接口
export const createCategory = (data: CreateCategoryParams) => {
    return request.post<any, CategoryItem>('/category/create', data);
};

// 更新分类接口
export const updateCategory = (categoryId: string, data: Partial<CreateCategoryParams>) => {
    return request.put<any, CategoryItem>(`/category/update/${categoryId}`, data);
};

// 删除分类接口
export const deleteCategory = (categoryId: string) => {
    return request.delete<any, void>(`/category/delete/${categoryId}`);
};


