export interface PublishCategoryRule {
    categoryId: string;
    modes: ('news' | 'topic')[];
    topics: string;
    newsDays: number;
    region: string;
    excludedTopics: string;
}
export interface AgentPublishConfig {
    collectionId: string;
    searchServerId: string;
    rules: PublishCategoryRule[];
    cooldownHours: number;
    unreadEnabled: boolean;
    unreadCount: number;
    ownerId?: string;
}
export interface PublishMaterial {
    url: string; title: string; summary: string; publishedAt: string | null; fetchedAt: string;
    searchWindow?: {days?: number; startDate?: string; endDate?: string; timeRange?: string};
}
export interface PublishPreview {
    status: 'ready' | 'skipped';
    reason: string;
    snapshot?: {
        phase: string;
        selection?: {categoryId: string; mode: 'news' | 'topic'; query: string; reason: string; expressionDirection?: string};
        materials: PublishMaterial[];
        draft?: {title: string; summary: string; content: string; reason: string; sourceUrls: string[]};
    };
}
