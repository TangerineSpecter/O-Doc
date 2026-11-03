import request from '../utils/request';
import type {TokenFilters, TokenGroups, TokenRequestContent, TokenRequests, TokenSummary} from '../types/api/tokenUsage';
const base = '/settings/agent-world/token-usage';
export type TokenExportFilters = TokenFilters & {include_content?: '1'};
export const exportTokenReport = (params: TokenExportFilters, signal?: AbortSignal) =>
    request.get<never, Blob>(`${base}/export/`, {params, signal, responseType: 'blob', timeout: 120000});
export interface ObservationExportSelection {
    agentId: string; startDate: string; endDate: string;
    activityFilter: string; activityLabel: string; requestIds: string[];
}
export const exportObservation = (selection: ObservationExportSelection, signal?: AbortSignal) =>
    request.post<never, Blob>(`${base}/observation-export/`, {
        activity_filter: selection.activityFilter, activity_label: selection.activityLabel, request_ids: selection.requestIds,
    }, {params: {agent_id: selection.agentId, start_date: selection.startDate, end_date: selection.endDate},
        signal, responseType: 'blob', timeout: 120000});
export const getTokenSummary = (params: TokenFilters, signal?: AbortSignal) =>
    request.get<never, TokenSummary>(`${base}/summary/`, {params, signal});
export const getTokenGroups = (params: TokenFilters & {group: string; page?: number}, signal?: AbortSignal) =>
    request.get<never, TokenGroups>(`${base}/breakdown/`, {params, signal});
export const getTokenRequests = (params: TokenFilters & {cursor?: string; page_size?: number}, signal?: AbortSignal) =>
    request.get<never, TokenRequests>(`${base}/requests/`, {params, signal});
export const getTokenRequestContent = (id: string, signal?: AbortSignal) =>
    request.get<never, TokenRequestContent>(`${base}/requests/${encodeURIComponent(id)}/content/`, {signal});
