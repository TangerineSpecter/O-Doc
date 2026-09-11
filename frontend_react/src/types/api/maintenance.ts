export type ReviewSourceType = 'article' | 'memo' | 'comment';
export type ReviewStatus = 'pending' | 'completed' | 'skipped';
export type ReviewSlotType = 'old_article' | 'old_memo' | 'recent_content' | 'comment_review';
export type HealthSeverity = 'critical' | 'warning' | 'info';

export interface MaintenanceTarget {
    view: 'article' | 'editor' | 'memos' | 'book' | 'resources';
    params: Record<string, string>;
}

export interface DailyReviewItem {
    id: string;
    reviewDate: string;
    slotType: ReviewSlotType;
    sourceType: ReviewSourceType;
    sourceId: string;
    status: ReviewStatus;
    title: string;
    excerpt: string;
    reasonCode: string;
    reasonText: string;
    sortOrder: number;
    meta: {
        updatedAt?: string;
        wordCount?: number;
        tag?: string;
        selectedText?: string;
        comment?: string;
        commenterName?: string;
        commenterType?: 'user' | 'agent';
        commenterAvatar?: string;
        commentedAt?: string;
        articleId?: string;
        annotationId?: string;
    };
    target: MaintenanceTarget;
}

export interface DailyReviewPayload {
    date: string;
    total: number;
    completed: number;
    skipped: number;
    pending: number;
    handled: number;
    streak: number;
    items: DailyReviewItem[];
}

export interface HealthIssue {
    issueKey: string;
    ruleCode: string;
    ruleTitle: string;
    severity: HealthSeverity;
    sourceType: string;
    sourceId: string;
    title: string;
    description: string;
    fingerprint: string;
    ignored: boolean;
    action: {
        type: 'navigate' | 'rag_sync';
        target?: MaintenanceTarget;
        articleId?: string;
    };
    meta: Record<string, unknown>;
}

export interface HealthPayload {
    score: number;
    status: '良好' | '待整理' | '需处理';
    severityCounts: Record<HealthSeverity, number>;
    ruleCounts: Record<string, number>;
    total: number;
    page: number;
    pageSize: number;
    items: HealthIssue[];
}

export interface MaintenanceOverview {
    review: {
        date: string;
        total: number;
        handled: number;
        pending: number;
        streak: number;
        leadItem: DailyReviewItem | null;
    };
    health: {
        score: number;
        status: string;
        severityCounts: Record<HealthSeverity, number>;
        total: number;
    };
}

export interface HealthQuery {
    severity?: HealthSeverity;
    ruleCode?: string;
    includeIgnored?: boolean;
    page?: number;
    pageSize?: number;
}

export interface HealthIssueIdentity {
    ruleCode: string;
    sourceType: string;
    sourceId: string;
    fingerprint?: string;
}
