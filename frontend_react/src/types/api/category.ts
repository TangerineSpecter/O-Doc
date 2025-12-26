// --- 分类相关类型定义 ---

export interface CategoryItem {
    categoryId: string;
    name: string;
    articleCount: number;
    description: string;
    iconKey: string;
    themeId: string;
    isSystem?: boolean;
}

export interface CreateCategoryParams {
    name: string;
    description: string;
    themeId: string;
    iconKey: string;
}