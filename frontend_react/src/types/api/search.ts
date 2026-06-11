export type GlobalSearchType = 'article' | 'memo' | 'image' | 'resource';

export interface GlobalSearchRoute {
    view: 'article' | 'memos' | 'image' | 'resources';
    params?: Record<string, any>;
}

export interface GlobalSearchItem {
    id: string;
    type: GlobalSearchType;
    title: string;
    subtitle: string;
    excerpt?: string;
    matchedFields?: string[];
    updatedAt?: string;
    route: GlobalSearchRoute;
    meta?: Record<string, any>;
}

export interface GlobalSearchResponse {
    keyword: string;
    total: number;
    items: GlobalSearchItem[];
    counts: Record<GlobalSearchType, number>;
}
