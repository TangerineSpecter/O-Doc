export interface AnalyticsResident {
    id: string;
    name: string;
    avatar: string;
    departed: boolean;
    archived?: boolean;
    professionName?: string | null;
}
export interface AnalyticsFilters {start_date: string; end_date: string; actor_id?: string}
export interface AnalyticsOverview {
    activeResidents: number; activeDays: number; publications: number; interactions: number;
    received: number; income: string; expense: string; net: string;
}
export interface AnalyticsComparison extends AnalyticsResident {
    activeDays: number; publications: number; interactions: number; received: number;
    income: string; expense: string; net: string;
}
export interface ResidentAnalyticsLedgerEntry {
    id: string; agentId: string; agentName: string; kind: string; amount: string;
    createdAt: string; detail: string; snapshot: Record<string, unknown> | null;
}
export interface ResidentAnalyticsLedgerPage {
    items: ResidentAnalyticsLedgerEntry[]; page: number; pageSize: number;
    hasMore: boolean; nextPage: number | null;
}
export interface ResidentAnalytics {
    startDate: string; endDate: string; actorId: string;
    residents: AnalyticsResident[]; overview: AnalyticsOverview;
    daily: {date: string; behaviors: number; activeResidents: number; income: string; expense: string}[];
    categories: {key: string; name: string; count: number; percentage: number}[];
    peers: {id: string; name: string; count: number}[];
    financeSources: {kind: string; income: string; expense: string}[];
    outcomes: {harvests: number; collections: number; journeys: number; destinations: number; explorations: number; wins: number};
    lotteryStatistics: {overview: LotteryAnalyticsMetrics; residents: LotteryAnalyticsResident[]};
    fishingComparison: FishingAnalyticsResident[];
    combatComparison: CombatAnalyticsResident[]; comparison: AnalyticsComparison[]; notes: string[];
}

export interface CombatAnalyticsResident extends AnalyticsResident {
    professionName?: string | null;
    job?: string | null;
    jobName?: string | null;
    explorations: number; settled: number; completed: number; ongoing: number;
    fallen: number; recalled: number; exhausted: number; otherEnded: number;
    kills: number; bossKills: number; experience: number; elapsedSeconds: number;
    longestSeconds: number; averageSeconds: number; energy: number; potions: number;
    successRate: number | null; killsPerHour: number | null; destinations: number;
    unclassifiedKills: number;
    monsters: {id: string; name: string; kills: number; highestLevel: number}[];
}

export interface FishingAnalyticsResident extends AnalyticsResident {
    trips: number; casts: number; catches: number; kings: number; escaped: number;
    empty: number; junk: number; experience: number; ordinaryCatches: number;
    ordinaryCatchRate: number | null;
}

export interface LotteryAnalyticsMetrics {
    purchases: number; tickets: number; rounds: number; settledTickets: number; pendingTickets: number;
    winningTickets: number; firstTickets: number; secondTickets: number; thirdTickets: number; unwonTickets: number;
    winningRounds: number; unknownTickets: number; winRate: number | null;
    expense: string; prizes: string; net: string; maxPrize: string;
    firstAwards: number; secondAwards: number; thirdAwards: number;
    firstPrize: string; secondPrize: string; thirdPrize: string;
}
export interface LotteryAnalyticsResident extends AnalyticsResident, LotteryAnalyticsMetrics {}
