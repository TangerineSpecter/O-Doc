import request from '../utils/request';

/**
 * 同步文章到知识库
 * @param articleId 文章ID
 */
export const syncArticleToRag = (articleId: string) => {
    // 后端使用了 djangorestframework-camel-case，会自动处理 articleId -> article_id 的转换
    return request.post('/rag/sync', { articleId });
};