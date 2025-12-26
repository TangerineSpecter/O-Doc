// --- 标签相关类型定义 ---

export interface TagItem {
    tagId: string;
    name: string;
    articleCount: number;
    themeId: string;
}

export interface CreateTagParams {
    name: string;
    themeId: string;
}