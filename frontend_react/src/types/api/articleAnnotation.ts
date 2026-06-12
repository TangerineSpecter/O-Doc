export type ArticleAnnotationCreatorType = 'user' | 'agent';

export interface ArticleAnnotationComment {
    commentId: string;
    annotationId: string;
    content: string;
    creatorType: ArticleAnnotationCreatorType;
    creatorId: string;
    creatorName: string;
    creatorAvatar?: string;
    createdAt: string;
    updatedAt?: string;
}

export interface ArticleAnnotation {
    annotationId: string;
    articleId: string;
    selectedText: string;
    startOffset: number;
    endOffset: number;
    storedStartOffset?: number;
    storedEndOffset?: number;
    prefixText?: string;
    suffixText?: string;
    contentHash?: string;
    located: boolean;
    locationReason?: string;
    creatorType: ArticleAnnotationCreatorType;
    creatorId: string;
    creatorName: string;
    creatorAvatar?: string;
    commentCount: number;
    comments: ArticleAnnotationComment[];
    createdAt: string;
    updatedAt?: string;
}

export interface ArticleAnnotationListResponse {
    annotations: ArticleAnnotation[];
    count: number;
}

export interface CreateArticleAnnotationParams {
    articleId: string;
    selectedText: string;
    startOffset?: number;
    endOffset?: number;
    comment: string;
}
