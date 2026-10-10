export type DailyFeedCategory = 'all' | 'publication' | 'interaction' | 'travel' | 'farm' | 'cooking' | 'market' | 'trade' | 'investment' | 'finance' | 'record';

export interface DailyFeedEvent {
    rating?: number | null;
    categories?: Exclude<DailyFeedCategory, 'all'>[];
    steps?: {id: string; title: string; detail: string; occurredAt: string; amount: string | null}[];
    id: string;
    category: Exclude<DailyFeedCategory, 'all'>;
    source: string;
    actorId: string;
    actorName: string;
    occurredAt: string;
    title: string;
    detail: string;
    status: string;
    amount: string | null;
    reason?: string;
    currentAction?: string;
    subAction?: string;
    isMotive?: boolean;
    counterpartName?: string;
    outputPreview?: string;
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
