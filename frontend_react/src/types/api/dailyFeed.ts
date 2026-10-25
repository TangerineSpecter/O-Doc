export type DailyFeedCategory = 'all' | 'fishing' | 'publication' | 'interaction' | 'travel' | 'exploration' | 'farm' | 'cooking' | 'alchemy' | 'blacksmith' | 'market' | 'trade' | 'investment' | 'finance' | 'record';

export interface DailyFeedEvent {
    rating?: number | null;
    categories?: Exclude<DailyFeedCategory, 'all'>[];
    steps?: {id: string; title: string; detail: string; occurredAt: string; amount: string | null}[];
    id: string;
    category: Exclude<DailyFeedCategory, 'all'> | 'decision';
    source: string;
    actorId: string;
    actorIds?: string[];
    actorName: string;
    occurredAt: string;
    title: string;
    detail: string;
    status: string;
    amount: string | null;
    reason?: string;
    decisionBasis?: 'model_reason' | 'choice_only';
    decisionSlot?: string;
    currentAction?: string;
    subAction?: string;
    isMotive?: boolean;
    counterpartName?: string;
    outputPreview?: string;
    explorationParty?: {min: number; max: number; final: number};
    target: {kind: string; id: string; [key: string]: string | undefined} | null;
}

export interface DailyFeedResult {
    date: string;
    items: DailyFeedEvent[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
    allTotal: number;
    counts: Partial<Record<Exclude<DailyFeedCategory, 'all'>, number>>;
    actorCounts: Record<string, number>;
}
