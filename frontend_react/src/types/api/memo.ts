export interface MemoItem {
    memoId: string;
    content: string;
    tag: string;
    isPinned: boolean;
    userId?: string;
    userName?: string;
    agentName?: string;
    agent?: {
        name?: string;
    };
    creatorType?: 'agent' | 'user';
    creatorId?: string;
    creatorName?: string;
    authorType?: 'agent' | 'user';
    createdByType?: 'agent' | 'user';
    createdAt: string;
    updatedAt: string;
}

export interface CreateMemoParams {
    content: string;
    tag?: string;
    isPinned?: boolean;
}

export interface MemoListParams {
    keyword?: string;
}
