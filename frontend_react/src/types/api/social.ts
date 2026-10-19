export interface SocialIdentity {name: string; avatar: string}
export interface Moment {
    id: string; actorId: string; identity: SocialIdentity; content: string; images: string[];
    imageState: {status?: string; error?: string; taskId?: string};
    canRetryImage?: boolean; createdAt: string; updatedAt: string; likeCount: number; liked: boolean; commentCount: number; canDelete: boolean;
    likedBy?: {actorId: string; identity: SocialIdentity}[];
}
export interface MomentComment {
    id: string; actorId: string; identity: SocialIdentity; content: string;
    parentId: string; rootId: string; replyToActorId: string; createdAt: string;
}
export interface SocialNotification {
    id: string; senderId: string; identity: SocialIdentity; sourceKind: 'post' | 'moment';
    contentId: string; contentUrl?: string; sourceId: string; status: string; readAt: string | null; createdAt: string;
}
export interface SocialSettings {
    enabled: boolean; agentIds: string[]; publishEnabled: boolean; readEnabled: boolean; replyEnabled: boolean;
    replyMode: 'idle_daily' | 'daily'; dailyReplies: number; dailyMoments: number; dailyImages: number; readLimit: number;
    imageEnabled: boolean; imageModelId: string; imageAspectRatio: string; imageSize: string;
    theatreDailyCount: number; theatreSearchServerId: string;
}
export interface SocialConfiguration {
    settings: SocialSettings; overrides: Record<string, Partial<SocialSettings>>; agents: {id: string; name: string}[];
    searchServers: {id: string; name: string}[];
}
export interface SocialTheatreTurn {
    id?: string; replyTo?: string;
    round: number; speakerId: string; name: string; avatar: string; content: string; createdAt: string;
}
export interface SocialTheatreRelationChange {
    actorId: string; counterpartId: string; actorName: string; counterpartName: string;
    affinityDelta: number; familiarityDelta: number; category: string; reason: string;
}
export interface SocialTheatreEvent {
    id: string; businessDate: string; scheduledAt: string; status: 'scheduled' | 'searching' | 'running' | 'completed' | 'skipped' | 'failed' | 'expired';
    error: string; manual?: boolean; source: {title: string; summary: string; url: string; publishedAt: string};
    messageCount?: number;
    topic?: {title?: string; event: string; question: string; tradeoff: string} | null;
    progress?: {
        stage: string; speakerName: string; startedAt: string; stageStartedAt: string;
        messageCount: number; reviewedCount: number; participantCount: number;
        candidateIndex: number; candidateCount: number;
    };
    relationChanges?: SocialTheatreRelationChange[];
    participants: {id: string; name: string; avatar: string}[]; rounds?: number; transcript?: SocialTheatreTurn[];
}
export interface SocialFeeling {
    actorId: string; counterpartId: string; familiarity: number; familiarityLabel: string; affinity: number; band: string;
    emotion: {kind: string; intensity: number; reason?: string}; reason: string;
}
