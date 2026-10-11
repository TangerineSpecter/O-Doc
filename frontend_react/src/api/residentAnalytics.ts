import request from '../utils/request';
import type {AnalyticsFilters, ResidentAnalytics} from '../types/api/residentAnalytics';

export const getResidentAnalytics = (params: AnalyticsFilters, signal?: AbortSignal) =>
    request.get<never, ResidentAnalytics>('/settings/agent-world/analytics/', {params, signal});
