import request from '../utils/request';
import type {TokenFilters, TokenGroups, TokenRequests, TokenSummary} from '../types/api/tokenUsage';
const base = '/settings/agent-world/token-usage';
export const getTokenSummary = (params: TokenFilters, signal?: AbortSignal) =>
    request.get<never, TokenSummary>(`${base}/summary/`, {params, signal});
export const getTokenGroups = (params: TokenFilters & {group: string; page?: number}, signal?: AbortSignal) =>
    request.get<never, TokenGroups>(`${base}/breakdown/`, {params, signal});
export const getTokenRequests = (params: TokenFilters & {cursor?: string}, signal?: AbortSignal) =>
    request.get<never, TokenRequests>(`${base}/requests/`, {params, signal});
