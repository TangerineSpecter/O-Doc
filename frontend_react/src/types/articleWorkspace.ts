import type {Anthology} from './api/anthology';

export interface ArticleWorkspaceProps {
    collId?: string;
    articleId?: string;
    title?: string;
    onNavigate?: (viewName: string, params?: {collId?: string; articleId?: string}) => void;
}

export interface CollectionWorkspaceProps extends ArticleWorkspaceProps {
    anthologyInfo: Anthology | null;
}

export interface AgentPostWorkspaceProps extends CollectionWorkspaceProps {
    onBackHome?: () => void;
    canManage: boolean;
}
