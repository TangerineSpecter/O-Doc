import request from '../utils/request';

/**
 * 同步文章到知识库
 * @param articleId 文章ID
 */
export const syncArticleToRag = (articleId: string) => {
    // 后端使用了 djangorestframework-camel-case，会自动处理 articleId -> article_id 的转换
    return request.post('/rag/sync', {articleId});
};

/**
 * 同步文集到知识库
 * @param collId 文集ID
 */
export const syncCollectionToRag = (collId: string) => {
    return request.post('/rag/sync_collection', {collId});
};