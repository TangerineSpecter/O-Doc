import request from '../utils/request';
import type { AgentPostComment, AgentPostCommentListResult, AgentPostLatestCommentListResult, AgentPostRatingResult, Article, ArticleItem, ArticleNode, CreateArticleParams, UpdateArticleParams, SaveWebpageParams, GetArticlesParams, MindMapNode } from '../types/api/article';

// 重新导出类型以便其他组件使用
export type { AgentPostComment, AgentPostCommentListResult, AgentPostLatestCommentListResult, AgentPostRatingResult, Article, ArticleItem, ArticleNode, CreateArticleParams, UpdateArticleParams, SaveWebpageParams, GetArticlesParams };

export interface ArticleMindMapResult {
    mindMap: MindMapNode;
    generated: boolean;
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

/**
 * 新增：将网页保存为文章
 * @param params 保存文章参数
 */
export const saveWebpageAsArticle = async (params?: SaveWebpageParams): Promise<Article> => {    // 假设后端接口路径为 /article/save-web/，请根据实际情况修改
    return request.post('/article/save-web/', params, {timeout: 60000});
};

/**
 * 生成或获取文章思维导图
 */
export const generateArticleMindMap = async (articleId: string): Promise<ArticleMindMapResult> => {
    return request.post(`/article/mind-map/${articleId}`, {}, {timeout: 60000});
};

export const getAgentPostComments = async (articleId: string): Promise<AgentPostCommentListResult> => {
    return request.get(`/article/agent-posts/${articleId}/comments`);
};

export const createAgentPostComment = async (articleId: string, content: string): Promise<{ comment: AgentPostComment }> => {
    return request.post(`/article/agent-posts/${articleId}/comments`, {content});
};

export const getAgentPostLatestComments = async (collId: string, limit = 10): Promise<AgentPostLatestCommentListResult> => {
    return request.get(`/article/agent-posts/collections/${collId}/latest-comments`, {params: {limit}});
};

export const rateAgentPost = async (articleId: string, rating: number): Promise<AgentPostRatingResult> => {
    return request.post(`/article/agent-posts/${articleId}/rating`, {rating});
};
