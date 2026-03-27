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
    type?: 'article' | 'image';
}

// 定义文集返回数据类型
export interface Anthology {
    collId: string;
    title: string;
    count: number;
    ragNotSyncedCount?: number;
    iconId: string;
    isTop: boolean;
    description: string;
    articles: ArticleSummary[];
    permission: 'public' | 'private';
    sort?: number;
    type?: 'article' | 'image'; // Added type field
}
