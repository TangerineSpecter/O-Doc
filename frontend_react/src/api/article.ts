import request from '../utils/request';

// 文章接口定义
interface Article {
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
    const response = await request.put(`/api/article/update/${articleId}`, params);
    return response.data;
};

/**
 * 删除文章
 */
export const deleteArticle = async (articleId: string): Promise<void> => {
    await request.delete(`/api/article/delete/${articleId}`);
};

/**
 * 根据文集获取文章列表
 */
export const getArticlesByAnthology = async (collId: string): Promise<Article[]> => {
    const response = await request.get(`/api/article/list/${collId}`);
    return response.data;
};
