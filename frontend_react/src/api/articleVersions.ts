import request from '../utils/request';
import type {ArticleVersion, ArticleVersionRestoreResult, ArticleVersionSummary} from '../types/api/articleVersion';

export const getArticleVersions = (articleId: string): Promise<ArticleVersionSummary[]> =>
    request.get(`/article/${articleId}/versions`);

export const getArticleVersion = (articleId: string, versionId: string): Promise<ArticleVersion> =>
    request.get(`/article/${articleId}/versions/${versionId}`);

export const restoreArticleVersion = (articleId: string, versionId: string): Promise<ArticleVersionRestoreResult> =>
    request.post(`/article/${articleId}/versions/${versionId}/restore`);
