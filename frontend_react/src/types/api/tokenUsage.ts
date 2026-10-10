export interface TokenMetrics {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestCount: number;
    incompleteCount: number;
    executionCount: number;
    averageTokens: number | null;
    collected: boolean;
}
export interface TokenGroup extends TokenMetrics {key: string; name: string; lastAt: string}
export interface RunTokenMetrics extends TokenMetrics {agents: TokenGroup[]}
export interface TokenSummary extends TokenMetrics {
    days: (TokenMetrics & {day: string})[];
    agents: {agentKey: string; name: string}[];
    tasks: {taskKey: string; name: string}[];
}
export interface TokenFilters {
    all?: '1'; start_date?: string; end_date?: string;
    agent_id?: string; task_id?: string; record_id?: string; purpose?: string; other?: '1';
}
export interface TokenRequest {
    id: string; agentKey: string; agentName: string; taskKey: string; taskName: string; recordKey: string;
    purpose: string; phase: string; modelName: string; providerName: string; attempt: number;
    status: string; usageComplete: boolean; startedAt: string; endedAt: string | null;
    inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
    cachedTokens: number | null; reasoningTokens: number | null;
}
export interface TokenGroups {items: TokenGroup[]; total: number; page: number; hasMore: boolean}
export interface TokenRequests {items: TokenRequest[]; nextCursor: string | null; hasMore: boolean}
