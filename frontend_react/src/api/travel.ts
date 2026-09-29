import request from '../utils/request';
import type {TravelJourney, InventoryItem, TravelOperation} from '../types/api/travel';
const base = '/settings/agent-world';
export const getTravel = (id: string, signal?: AbortSignal) => request.get<never, TravelJourney>(`${base}/travel/${id}/`, {signal});
export const getInventory = (agentId: string, signal?: AbortSignal) => request.get<never, InventoryItem[]>(`${base}/inventory/`, {params: {agentId}, signal});
export const actOnTravel = (id: string, action: TravelOperation, extra?: {assetId?: string; confirmCharge?: boolean}) => request.post<never, TravelJourney>(`${base}/travel/${id}/`, {action, ...extra});
