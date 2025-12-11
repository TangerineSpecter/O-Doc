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
    categoryDetail?: {
        categoryId: string;
        name: string;
    };
    parent_id?: string; // 父级文章ID（写入）
    parentDetail?: { // 父级文章详情（读取）
        articleId: string;
        title: string;
    };
    sort: number;
    parent?: number | null;
    children?: Article[];
    tags?: Array<{ tagId: string, name: string }>;
    tagDetails?: Array<{ tagId: string; name: string }>;
    desc?: string;
    readTime?: number;
    collection?: boolean;
    attachments?: Array<{
        id: string;
        name: string;
        size?: number;
        type?: string;
        url: string;
    }>;
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
}

// 文章树形节点结构
export interface ArticleNode {
    id: string;
    articleId: string;
    title: string;
    date?: string;
    type: 'doc' | 'folder'; // 节点类型
    children?: ArticleNode[];
    parentId?: string; // 可选，方便前端处理
}

// 创建文章参数
interface CreateArticleParams {
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
interface UpdateArticleParams {
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

/**
 * 创建文章
 */
export const createArticle = async (params: CreateArticleParams): Promise<Article> => {
    // 修改：直接返回 request 结果
    return request.post('/article/create', params);
};

/**
 * 获取文章详情
 */
export const getArticleDetail = async (articleId: string): Promise<Article> => {
    // 修改：直接返回 request 结果
    return request.get(`/article/detail/${articleId}`);
};

/**
 * 更新文章
 */
export const updateArticle = async (articleId: string, params: UpdateArticleParams): Promise<Article> => {
    // 修改：直接返回 request 结果
    return request.put(`/article/update/${articleId}`, params);
};

/**
 * 删除文章
 */
export const deleteArticle = async (articleId: string): Promise<void> => {
    // 修改：直接返回 request 结果
    return request.delete(`/article/delete/${articleId}`);
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
    // 修改：直接返回 request 结果
    return request.get('/article/list', {params});
};

/**
 * 根据文集获取文章列表（兼容旧接口调用方式）
 */
export const getArticlesByAnthology = async (collId: string): Promise<Article[]> => {
    return getArticles({collId});
};

/**
 * 根据文集获取树形结构文章列表
 */
export const getArticleTreeByAnthology = async (collId: string): Promise<ArticleNode[]> => {
    return request.get('/article/tree-list', {params: {collId}});
};