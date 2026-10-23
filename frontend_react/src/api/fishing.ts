import request from '../utils/request';
import type {FishingCatalog, FishingDetail, FishingOverview, FishingTrip} from '../types/api/fishing';
const base = '/settings/agent-world/fishing';
export const getFishing = (page: number, signal?: AbortSignal, actorId = '') => request.get<never, FishingOverview>(`${base}/`, {params: {page, actorId}, signal});
export const getFishingConfig = (signal?: AbortSignal) => request.get<never, {enabled: boolean}>(`${base}/config/`, {signal});
export const saveFishingConfig = (enabled: boolean) => request.post<never, {enabled: boolean}>(`${base}/config/`, {enabled});
export const getFishingCatalog = (actorId = '', signal?: AbortSignal) => request.get<never, FishingCatalog>(`${base}/catalog/`, {params: {actorId}, signal});
export const getFishingTrip = (id: string, page = 1, signal?: AbortSignal) => request.get<never, FishingDetail>(`${base}/trips/${encodeURIComponent(id)}/`, {params: {page}, signal});
export const actOnFishingTrip = (id: string, action: 'recall' | 'retry') => request.post<never, FishingTrip>(`${base}/trips/${encodeURIComponent(id)}/${action}/`);
