export type PerformanceKind = '' | 'request' | 'stream' | 'sql' | 'ai' | 'task' | 'http';
export interface Percentile { lowerMs: number; upperMs: number | null }
export interface PerformanceMetrics {
    count: number; errors: number; slow: number; totalMs: number;
    averageMs: number | null; maxMs: number | null; errorRatio: number | null;
    slowRatio: number | null; p95: Percentile | null; p99: Percentile | null;
    sqlCount: number; sqlMs: number;
    histogramStatus?: 'empty' | 'available' | 'invalid' | 'incompatible';
}
export interface PerformancePolicy {
    enabled: boolean; version: number; generation: number; requestMs: number; sqlMs: number;
    sqlTotalMs: number; sqlCount: number; streamMs: number; firstChunkMs: number;
    aiMs: number; firstOutputMs: number; taskMs: number; httpMs: number;
    sampleDays: number; aggregateDays: number; maxMb: number;
}
export interface PerformanceOverview {
    start: string; end: string; truncated: boolean; byKind: Partial<Record<Exclude<PerformanceKind, ''>, PerformanceMetrics>>;
    policy: PerformancePolicy;
    trend: (PerformanceMetrics & {at: number; kind: PerformanceKind})[];
    trendStepSeconds: number;
    inflight: {id: string; operation: string; kind: PerformanceKind; started: number; status: string; elapsedMs: number}[];
    health: {dropped: number; failedBatches: number; lastFlush: number | null; error: string | null; queueSize: number; processId: number};
}
export interface PerformanceRanking extends PerformanceMetrics {
    operation: string; method?: string; policyVersion: number; build: {version?: string; commit?: string | null};
}
export interface PerformanceSample {
    id: string; created: string; kind: PerformanceKind; operation: string; durationMs: number; status: string;
}
export interface PerformanceEvent {
    id: string; rootId: string; parentId: string | null; operation: string; kind: PerformanceKind;
    started: number; durationMs: number; status: string; sqlCount: number; sqlMs: number;
    source?: {file: string; function: string; line: number}[];
    build: {version?: string; commit?: string | null};
    firstOutputMs?: number; firstChunkMs?: number; truncated?: number;
    children?: PerformanceEvent[];
    slow?: boolean; policyVersion?: number;
    sql?: {fingerprint: string; statement: string; template: string | null; templateReason?: string};
}
export interface PerformanceDetail {
    event: PerformanceEvent;
    baseline: {durationComparison: PerformanceMetrics; allResults: PerformanceMetrics; note: string; truncated: boolean};
}
export interface DatabasePerformance {
    status: string; reason?: string; gap?: string; selection?: string; sampledAt?: number;
    rows: {identity: string; calls: number; totalMs: number; meanMs: number; maxMs: number | null}[];
    intervalRows?: DatabasePerformance['rows'];
}
