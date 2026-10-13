import request from '../utils/request';
import type {AnalyticsFilters, ResidentAnalytics, ResidentAnalyticsLedgerPage} from '../types/api/residentAnalytics';

export const getResidentAnalytics = (params: AnalyticsFilters, signal?: AbortSignal) =>
    request.get<never, ResidentAnalytics>('/settings/agent-world/analytics/', {params, signal});

export const getResidentAnalyticsLedger = (params: {
    start_date: string; end_date: string; actor_id: string; page: number; page_size?: number;
}, signal?: AbortSignal) =>
    request.get<never, ResidentAnalyticsLedgerPage>('/settings/agent-world/analytics/ledger/', {params, signal});
