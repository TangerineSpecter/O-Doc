export interface LogSummary { id: string; created: number; module: string; title: string; errorType: string; requestId: string }
export interface LogDetail extends LogSummary { [key: string]: unknown }
export interface LogOverview { total: number; latest: number | null; recent: number; bytes: number; policy: { days: number; maxMb: number }; modules: string[] }
export interface LogQuery { page: number; module: string; q: string; since?: number; until?: number }
export interface LogPage { list: LogSummary[]; total: number; page: number; pageSize: number }
