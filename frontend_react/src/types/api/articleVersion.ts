import type {Article} from './article';

export type ArticleVersionSource = 'save' | 'polish' | 'restore' | 'import';

export interface ArticleVersionSummary {
    versionId: string;
    title: string;
    source: ArticleVersionSource;
    operatorId: string;
    wordCount: number;
    createdAt: string;
}

export interface ArticleVersion extends ArticleVersionSummary {
    articleId: string;
    content: string;
    collId: string;
    categoryId: string;
    tagIds: string[];
    postSummary: string;
}

export interface ArticleVersionRestoreResult {
    article: Article;
    warnings: string[];
}
