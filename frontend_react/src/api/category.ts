import request from '../utils/request';
import type { CategoryItem, CreateCategoryParams } from '../types/api/category';

// 重新导出类型以便其他组件使用
export type { CategoryItem, CreateCategoryParams };


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


