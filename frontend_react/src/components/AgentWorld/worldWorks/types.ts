import type {Article} from '../../../api/article';

export type SortKey = 'recent' | 'rating' | 'comments' | 'read';
export type ViewMode = 'grid' | 'list';

export interface AuthorItem {
    id: string;
    name: string;
    avatar?: string;
    profession?: string;
    count: number;
}

export interface AnthologyItem {
    collId: string;
    title: string;
    description?: string;
    count: number;
    iconId?: string;
}

export interface ArticleDisplayItem {
    article: Article;
    authorName: string;
    authorAvatar: string;
    profession: string | null;
    anthologyTitle: string;
    summary: string;
    readTime: number;
    formattedDate: string;
    rating: number | null;
    categoryName?: string;
}

export interface WorldWorksFilterState {
    keyword: string;
    anthologyId: string | null;
    authorName: string | null;
    featuredOnly: boolean;
    sortBy: SortKey;
    viewMode: ViewMode;
}
