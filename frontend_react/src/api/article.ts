import request from '../utils/request';
import type { AgentPostComment, AgentPostCommentListResult, AgentPostLatestCommentListResult, AgentPostRatingResult, Article, ArticleFileImportProgress, ArticleItem, ArticleNode, CreateArticleParams, UpdateArticleParams, SaveWebpageParams, ImportArticleFileParams, ImportArticleFilesResult, SaveWebpageResult, GetArticlesParams, MindMapNode } from '../types/api/article';

// 重新导出类型以便其他组件使用
export type { AgentPostComment, AgentPostCommentListResult, AgentPostLatestCommentListResult, AgentPostRatingResult, Article, ArticleItem, ArticleNode, CreateArticleParams, UpdateArticleParams, SaveWebpageParams, ImportArticleFileParams, ImportArticleFilesResult, SaveWebpageResult, GetArticlesParams };

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
export const saveWebpageAsArticle = async (params: SaveWebpageParams): Promise<SaveWebpageResult> => {
    return request.post('/article/save-web/', params, {timeout: 180000});
};

/**
 * 导入本地 HTML 或 Markdown 文件
 */
export function importArticleFile(params: ImportArticleFileParams & {importMode: 'original'}): Promise<{articles: SaveWebpageResult[]}>;
export function importArticleFile(params: ImportArticleFileParams & {importMode?: 'extract'}): Promise<SaveWebpageResult>;
export async function importArticleFile(params: ImportArticleFileParams): Promise<SaveWebpageResult | {articles: SaveWebpageResult[]}> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('collId', params.collId);
    formData.append('useAiExtraction', String(params.useAiExtraction));
    formData.append('needPolishing', String(params.needPolishing));
    formData.append('importMode', params.importMode || 'extract');
    return request.post('/article/import-file/', formData, {timeout: 180000});
}

interface ImportArticleFilesParams extends Omit<ImportArticleFileParams, 'file'> {
    files: File[];
    onProgress?: (progress: ArticleFileImportProgress) => void;
}

/**
 * 顺序导入多个文章文件。每个文件使用独立请求，失败不会回滚已成功的文章。
 */
export const importArticleFiles = async (
    params: ImportArticleFilesParams,
): Promise<ImportArticleFilesResult> => {
    const successful: SaveWebpageResult[] = [];
    const failures: ImportArticleFilesResult['failures'] = [];
    const {files, onProgress, ...commonParams} = params;

    for (const [index, file] of files.entries()) {
        onProgress?.({completed: index, total: files.length, currentFile: file.name});
        try {
            if (commonParams.importMode === 'original') {
                const result = await importArticleFile({...commonParams, file, importMode: 'original'});
                successful.push(...result.articles);
            } else {
                successful.push(await importArticleFile({...commonParams, file, importMode: 'extract'}));
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : '导入失败';
            failures.push({fileName: file.name, message});
        }
        onProgress?.({completed: index + 1, total: files.length, currentFile: file.name});
    }

    return {successful, failures};
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
