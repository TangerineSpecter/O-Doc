import {ARTICLE_TEMPLATES, type ArticleTemplate} from '../constants/articleTemplates';

export type {ArticleTemplate};

export const USER_ARTICLE_TEMPLATE_STORAGE_KEY = 'o-doc-user-article-templates';
export const USER_ARTICLE_TEMPLATE_CHANGE_EVENT = 'o-doc-user-article-templates-change';
export const USER_ARTICLE_TEMPLATE_ID_PREFIX = 'user-';
export const MAX_USER_ARTICLE_TEMPLATES = 40;
export const MAX_TEMPLATE_NAME_LENGTH = 40;
export const MAX_TEMPLATE_DESCRIPTION_LENGTH = 80;
export const MAX_TEMPLATE_CONTENT_LENGTH = 200_000;

export type UserArticleTemplateInput = {
    name: string;
    description?: string;
    content: string;
};

export type SaveUserArticleTemplateResult =
    | {ok: true; template: ArticleTemplate; templates: ArticleTemplate[]}
    | {ok: false; error: string};

const BUILTIN_IDS = new Set(ARTICLE_TEMPLATES.map(template => template.id));

export function isUserArticleTemplate(template: Pick<ArticleTemplate, 'id' | 'source'>): boolean {
    return template.source === 'user' || template.id.startsWith(USER_ARTICLE_TEMPLATE_ID_PREFIX);
}

export function isBlankArticleTemplate(template: ArticleTemplate): boolean {
    return template.content.trim() === '';
}

export function suggestUserArticleTemplateName(title: string): string {
    const trimmed = title.trim();
    if (!trimmed || trimmed === '未命名文档') return '我的模板';
    return trimmed.slice(0, MAX_TEMPLATE_NAME_LENGTH);
}

export function parseUserArticleTemplates(raw: string | null | undefined): ArticleTemplate[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        const seen = new Set<string>();
        const templates: ArticleTemplate[] = [];
        for (const item of parsed) {
            const template = normalizeUserArticleTemplate(item);
            if (!template || seen.has(template.id) || BUILTIN_IDS.has(template.id)) continue;
            seen.add(template.id);
            templates.push(template);
        }
        return templates;
    } catch {
        return [];
    }
}

export function serializeUserArticleTemplates(templates: ArticleTemplate[]): string {
    return JSON.stringify(
        templates.filter(isUserArticleTemplate).map(template => ({
            id: template.id,
            name: template.name,
            description: template.description,
            content: template.content,
        })),
    );
}

export function saveUserArticleTemplate(
    existing: ArticleTemplate[],
    input: UserArticleTemplateInput,
    options: {id?: string; now?: number} = {},
): SaveUserArticleTemplateResult {
    const name = input.name.trim();
    if (!name) return {ok: false, error: '请填写模板名称'};

    const current = parseUserArticleTemplates(serializeUserArticleTemplates(existing));
    if (current.length >= MAX_USER_ARTICLE_TEMPLATES) {
        return {ok: false, error: `最多保存 ${MAX_USER_ARTICLE_TEMPLATES} 个自定义模板`};
    }

    const now = options.now ?? Date.now();
    const template: ArticleTemplate = {
        id: options.id ?? `${USER_ARTICLE_TEMPLATE_ID_PREFIX}${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.slice(0, MAX_TEMPLATE_NAME_LENGTH),
        description: (input.description ?? '').trim().slice(0, MAX_TEMPLATE_DESCRIPTION_LENGTH),
        content: input.content.slice(0, MAX_TEMPLATE_CONTENT_LENGTH),
        source: 'user',
    };

    if (!template.id.startsWith(USER_ARTICLE_TEMPLATE_ID_PREFIX) || BUILTIN_IDS.has(template.id)) {
        return {ok: false, error: '自定义模板 id 非法'};
    }
    if (current.some(item => item.id === template.id)) {
        return {ok: false, error: '模板已存在'};
    }

    return {ok: true, template, templates: [...current, template]};
}

export function removeUserArticleTemplate(existing: ArticleTemplate[], id: string): ArticleTemplate[] {
    return parseUserArticleTemplates(serializeUserArticleTemplates(existing)).filter(template => template.id !== id);
}

export function listArticleTemplates(userTemplates: ArticleTemplate[] = []): ArticleTemplate[] {
    const builtins = ARTICLE_TEMPLATES.map(template => ({...template, source: 'builtin' as const}));
    const users = parseUserArticleTemplates(serializeUserArticleTemplates(userTemplates));
    return [...builtins, ...users];
}

export function getArticleTemplate(id: string, userTemplates: ArticleTemplate[] = []): ArticleTemplate | undefined {
    return listArticleTemplates(userTemplates).find(template => template.id === id);
}

export function loadUserArticleTemplates(): ArticleTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
        return parseUserArticleTemplates(window.localStorage.getItem(USER_ARTICLE_TEMPLATE_STORAGE_KEY));
    } catch {
        return [];
    }
}

export function persistUserArticleTemplates(templates: ArticleTemplate[]): void {
    window.localStorage.setItem(USER_ARTICLE_TEMPLATE_STORAGE_KEY, serializeUserArticleTemplates(templates));
    window.dispatchEvent(new Event(USER_ARTICLE_TEMPLATE_CHANGE_EVENT));
}

export function subscribeUserArticleTemplates(onChange: () => void): () => void {
    const onStorage = (event: StorageEvent) => {
        if (event.key === USER_ARTICLE_TEMPLATE_STORAGE_KEY || event.key === null) onChange();
    };
    window.addEventListener(USER_ARTICLE_TEMPLATE_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(USER_ARTICLE_TEMPLATE_CHANGE_EVENT, onChange);
        window.removeEventListener('storage', onStorage);
    };
}

function normalizeUserArticleTemplate(item: unknown): ArticleTemplate | null {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.startsWith(USER_ARTICLE_TEMPLATE_ID_PREFIX)) return null;
    if (typeof record.name !== 'string' || record.name.trim() === '') return null;
    if (typeof record.content !== 'string') return null;
    const description = typeof record.description === 'string' ? record.description : '';
    return {
        id: record.id,
        name: record.name.trim().slice(0, MAX_TEMPLATE_NAME_LENGTH),
        description: description.trim().slice(0, MAX_TEMPLATE_DESCRIPTION_LENGTH),
        content: record.content.slice(0, MAX_TEMPLATE_CONTENT_LENGTH),
        source: 'user',
    };
}
