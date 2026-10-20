export interface TokenMetrics {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    requestCount: number;
    incompleteCount: number;
    executionCount: number;
    largeModelTokens: number;
    decisionModelTokens: number;
    averageTokens: number | null;
    collected: boolean;
}
export interface TokenGroup extends TokenMetrics {key: string; name: string; lastAt: string}
export interface UnassignedTokenUsage extends TokenMetrics {
    lastAt: string;
    purposes: (TokenMetrics & {key: string})[];
}
export interface RunTokenMetrics extends TokenMetrics {agents: TokenGroup[]}
export interface TokenSummary extends TokenMetrics {
    days: (TokenMetrics & {day: string})[];
    hours?: (TokenMetrics & {hour: string})[];
    agents: {agentKey: string; name: string}[];
    tasks: {taskKey: string; name: string}[];
}
export interface TokenFilters {
    all?: '1'; start_date?: string; end_date?: string;
    agent_id?: string; task_id?: string; record_id?: string; purpose?: string; other?: '1';
}
export interface TokenRequest {
    id: string; agentKey: string; agentName: string; taskKey: string; taskName: string; recordKey: string;
    purpose: string; phase: string; modelName: string; modelType: 'large_model' | 'decision_model'; providerName: string; attempt: number;
    status: string; usageComplete: boolean; startedAt: string; endedAt: string | null;
    inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
    cachedTokens: number | null; reasoningTokens: number | null;
}
export interface TokenGroups {items: TokenGroup[]; total: number; page: number; hasMore: boolean; unassigned?: UnassignedTokenUsage | null}
export interface TokenRequests {items: TokenRequest[]; nextCursor: string | null; hasMore: boolean}
export interface TokenRequestContent {
    available: boolean;
    message?: string;
    request?: unknown;
    response?: unknown;
    status?: string;
    errorType?: string | null;
    startedAt?: string;
    endedAt?: string | null;
}
export interface FlowBlock {
    id: string;
    label: string;
    text: string;
    chars: number;
    bytes: number;
    preview: string;
}
export interface FlowStep {
    id: string;
    index: number;
    title: string;
    purposeLabel: string;
    modelName: string;
    modelType: 'large_model' | 'decision_model';
    agentName: string;
    startedAt: string;
    totalTokens: number | null;
    inputs: FlowBlock[];
    output: FlowBlock[];
    outputSummary: string;
    /** 正文无法展示时的说明；为空表示输入输出均已解析。 */
    unavailable?: string;
    rawRequest?: unknown;
    rawResponse?: unknown;
}
