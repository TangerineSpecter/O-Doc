import request from '../utils/request';
import type {
    ArticleAnnotation,
    ArticleAnnotationComment,
    ArticleAnnotationListResponse,
    CreateArticleAnnotationParams
} from '../types/api/articleAnnotation';

export type {
    ArticleAnnotation,
    ArticleAnnotationComment,
    ArticleAnnotationListResponse,
    CreateArticleAnnotationParams
} from '../types/api/articleAnnotation';

export const getArticleAnnotations = (articleId: string) => {
    return request.get<any, ArticleAnnotationListResponse>('/article/annotations', {params: {articleId}});
};

export const createArticleAnnotation = (data: CreateArticleAnnotationParams) => {
    return request.post<any, { annotation: ArticleAnnotation }>('/article/annotations', data);
};

export const addArticleAnnotationComment = (annotationId: string, comment: string) => {
    return request.post<any, { comment: ArticleAnnotationComment }>(`/article/annotations/${annotationId}/comments`, {comment});
};

export const deleteArticleAnnotation = (annotationId: string) => {
    return request.delete<any, { annotationId: string; deleted: boolean }>(`/article/annotations/${annotationId}`);
};

export const deleteArticleAnnotationComment = (commentId: string) => {
    return request.delete<any, { commentId: string; deleted: boolean }>(`/article/annotation-comments/${commentId}`);
};
