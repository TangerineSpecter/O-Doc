export type BountyStatus = 'open' | 'claimed' | 'delivered' | 'accepted' | 'cancelled';

export interface BountyAgentRef {
    id: string;
    name: string;
    avatar: string;
}

export interface BountyArticleRef {
    articleId: string;
    title: string;
    collId: string;
    category: string;
    sourceUrl: string;
    createdAt: string;
}

export interface BountyInviteRow {
    agentId: string;
    agentName: string;
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    reason: string;
}

export interface BountyDeliveryRow {
    id: string;
    articleId: string;
    status: 'pending' | 'accepted' | 'rejected';
    rejectReason: string;
    summary: string;
    createdAt: string;
}

export interface Bounty {
    id: string;
    title: string;
    objective: string;
    requirements: string;
    collectionId: string;
    collectionTitle: string;
    categoryId: string;
    categoryName: string;
    reward: string;
    status: BountyStatus;
    agent: BountyAgentRef | null;
    inviteAt: string | null;
    expireAt: string | null;
    claimedAt: string | null;
    deliveredAt: string | null;
    acceptedAt: string | null;
    attempt: number;
    failures: number;
    rejectReason: string;
    lastError: string;
    createdAt: string;
    article: BountyArticleRef | null;
    invitedCount: number;
    invites?: BountyInviteRow[];
    deliveries?: BountyDeliveryRow[];
}

export interface BountyOptions {
    collections: { id: string; title: string }[];
    categories: { id: string; name: string }[];
    residents: { id: string; name: string; avatar: string; money: string }[];
    searchReady: boolean;
    inviteDelayMinutes: number;
    claimHours: number;
}

export interface BountyListResult {
    items: Bounty[];
    hasMore: boolean;
}

export interface BountyCreateInput {
    title: string;
    objective: string;
    requirements: string;
    collectionId: string;
    categoryId: string;
    reward: string;
    agentIds?: string[];
}
