import {ARTICLE_TEMPLATES, type ArticleTemplate} from '../constants/articleTemplates';

export type {ArticleTemplate};

export function listArticleTemplates(): ArticleTemplate[] {
    return ARTICLE_TEMPLATES;
}

export function getArticleTemplate(id: string): ArticleTemplate | undefined {
    return ARTICLE_TEMPLATES.find(template => template.id === id);
}

export function isBlankArticleTemplate(template: ArticleTemplate): boolean {
    return template.content.trim() === '';
}
