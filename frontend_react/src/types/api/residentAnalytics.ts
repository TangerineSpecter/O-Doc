export interface AnalyticsResident {id: string; name: string; avatar: string; departed: boolean; archived?: boolean}
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
    comparison: AnalyticsComparison[]; notes: string[];
}
