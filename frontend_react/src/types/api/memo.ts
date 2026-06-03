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

export interface MemoGraphNode {
    id: string;
    name: string;
    category: 'memo' | 'tag';
    value: number;
    symbolSize: number;
    memo?: MemoItem;
}

export interface MemoGraphLink {
    source: string;
    target: string;
    relation: '标签' | '相似' | string;
    value: number;
    similarity?: number;
}

export interface MemoKnowledgeGraphStats {
    memoCount: number;
    tagCount: number;
    semanticLinkCount: number;
}

export interface MemoKnowledgeGraph {
    nodes: MemoGraphNode[];
    links: MemoGraphLink[];
    stats: MemoKnowledgeGraphStats;
}

export interface MemoKnowledgeGraphParams extends MemoListParams {
    tag?: string;
    limit?: number;
    threshold?: number;
}

export interface MemoVectorSyncResult {
    totalCount: number;
    syncedCount: number;
}
