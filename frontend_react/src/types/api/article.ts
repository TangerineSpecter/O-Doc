// 文章接口定义
export interface MindMapNode {
    title: string;
    children?: MindMapNode[];
}

export interface Article {
    id: number;
    articleId: string;
    title: string;
    content: string;
    collId: string;
    author: string;
    authorName?: string;
    createdAt: string;
    updatedAt: string;
    isValid: boolean;
    permission: 'public' | 'private';
    readCount: number;
    wordCount?: number;
    readTime?: number;
    categoryId?: string;
    categoryDetail?: {
        categoryId: string;
        name: string;
        themeId?: string;
        iconKey?: string;
    };
    parent_id?: string;
    parentDetail?: {
        articleId: string;
        title: string;
    };
    sort: number;
    parent?: number | null;
    children?: Article[];
    tags?: Array<{ tagId: string, name: string }>;
    tagDetails?: Array<{ tagId: string; name: string }>;
    desc?: string;
    collection?: boolean;
    attachments?: Array<{
        id: string;
        name: string;
        size?: number;
        type?: string;
        url: string;
    }>;
    is_polishing?: boolean;
    source_url?: string;
    isRagSynced?: boolean;
    lastRagSyncedAt?: string;
    mindMap?: MindMapNode;
    postSummary?: string;
    agentPostCreatorId?: string;
    agentPostCreatorName?: string;
    agentPostCreatorAvatar?: string;
    agentPostCategory?: string;
    agentPostRating?: number;
    agentPostRatingCount?: number;
    myAgentPostRating?: number | null;
    postCommentCount?: number;
}

export interface AgentPostComment {
    commentId: string;
    article: string;
    content: string;
    creatorId: string;
    creatorName: string;
    creatorAvatar: string;
    createdAt: string;
    updatedAt: string;
}

export interface AgentPostCommentListResult {
    comments: AgentPostComment[];
    count: number;
}

export interface AgentPostLatestComment {
    commentId: string;
    articleId: string;
    postTitle: string;
    content: string;
    agentName: string;
    agentAvatar: string;
    createdAt: string;
}

export interface AgentPostLatestCommentListResult {
    comments: AgentPostLatestComment[];
    count: number;
}

export interface AgentPostRatingResult {
    rating: number;
    ratingCount: number;
    myRating?: number | null;
}

//前端列表通用的文章项类型 (ViewModel)
export interface ArticleItem {
    articleId: string;
    title: string;
    desc: string;
    date: string;
    readTime: number;
    tags: string[];
    collId: string;
    collection?: boolean;
    category?: {
        id: string;
        name: string;
        themeId?: string;
        iconKey?: string;
    };
    isRagSynced?: boolean;
    lastRagSyncedAt?: string;
    updatedAt?: string;
}

// 文章树形节点结构
export interface ArticleNode {
    id: string;
    articleId: string;
    title: string;
    date?: string;
    type: 'doc' | 'folder';
    children?: ArticleNode[];
    parentId?: string;
    is_polishing?: boolean;
}

// 创建文章参数
export interface CreateArticleParams {
    title: string;
    content: string;
    collId: string;
    parentId?: string;
    permission?: 'public' | 'private';
    categoryId?: string;
    sort?: number;
    tags?: string[];
    assets?: string[];
}

// 更新文章参数
export interface UpdateArticleParams {
    title?: string;
    content?: string;
    isValid?: boolean;
    permission?: 'public' | 'private';
    categoryId?: string;
    sort?: number;
    parentId?: string;
    tags?: string[];
    assets?: string[];
}

//保存网页接口参数
export interface SaveWebpageParams {
    url: string;
    needPolishing: boolean;
    collId: string;
}

// 定义文章列表查询参数
export interface GetArticlesParams {
    collId?: string;
    tagId?: string;
    categoryId?: string;
    keyword?: string;
}
