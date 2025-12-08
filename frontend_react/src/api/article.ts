import request from '../utils/request';

// 文章接口定义
export interface Article {
    id: number;
    articleId: string;
    title: string;
    content: string;
    collId: string;
    author: string;
    createdAt: string;
    updatedAt: string;
    isValid: boolean;
    permission: 'public' | 'private';
    readCount: number;
    categoryId?: string;
    sort: number;
    tags?: Array<{tagId: string, name: string}>;
    desc?: string;
    readTime?: number;
    collection?: boolean;
}

// 创建文章参数
interface CreateArticleParams {
    title: string;
    content: string;
    collId: string;
    permission?: 'public' | 'private';
    categoryId?: string;
    sort?: number;
}

// 更新文章参数
interface UpdateArticleParams {
    title?: string;
    content?: string;
    isValid?: boolean;
    permission?: 'public' | 'private';
    categoryId?: string;
    sort?: number;
}

/**
 * 创建文章
 */
export const createArticle = async (params: CreateArticleParams): Promise<Article> => {
    const response = await request.post('/article/create', params);
    return response.data;
};

/**
 * 获取文章详情
 */
export const getArticleDetail = async (articleId: string): Promise<Article> => {
    const response = await request.get(`/article/detail/${articleId}`);
    return response.data;
};

/**
 * 更新文章
 */
export const updateArticle = async (articleId: string, params: UpdateArticleParams): Promise<Article> => {
    const response = await request.put(`/article/update/${articleId}`, params);
    return response.data;
};

/**
 * 删除文章
 */
export const deleteArticle = async (articleId: string): Promise<void> => {
    await request.delete(`/article/delete/${articleId}`);
};

// 定义文章列表查询参数
export interface GetArticlesParams {
    collId?: string;
    tagId?: string;
    categoryId?: string;
    keyword?: string;
}

/**
 * 文章列表查询，支持多条件
 */
export const getArticles = async (params?: GetArticlesParams): Promise<Article[]> => {
    const response = await request.get('/article/list', { params });
    return response.data;
};

/**
 * 根据文集获取文章列表（兼容旧接口调用方式）
 */
export const getArticlesByAnthology = async (collId: string): Promise<Article[]> => {
    return getArticles({ collId });
};
