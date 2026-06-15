// 定义文章摘要类型
export interface ArticleSummary {
    articleId?: string;
    imageId?: string;
    title: string;
    date: string;
    imageUrl?: string;
    summary?: string;
    agentId?: string;
    agentName?: string;
    agentAvatar?: string;
    category?: string;
    rating?: number;
    ratingCount?: number;
    commentCount?: number;
    createdAt?: string;
}

// 定义创建文集参数类型
export interface CreateAnthologyParams {
    title: string;
    description: string;
    iconId: string;
    permission: 'public' | 'private';
    isTop?: boolean;
    hideCoverContent?: boolean;
    sort?: number;
    type?: 'article' | 'image' | 'agent';
}

// 定义文集返回数据类型
export interface Anthology {
    collId: string;
    title: string;
    count: number;
    ragNotSyncedCount?: number;
    iconId: string;
    isTop: boolean;
    hideCoverContent?: boolean;
    hide_cover_content?: boolean;
    description: string;
    articles: ArticleSummary[];
    permission: 'public' | 'private';
    sort?: number;
    type?: 'article' | 'image' | 'agent'; // Added type field
}
