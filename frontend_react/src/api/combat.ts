import request from '../utils/request';
import type {CombatCatalog, CombatProfile, CombatSnapshot, CombatHistory, CombatConfig} from '../types/api/combat';
const base = '/settings/agent-world/combat/';
const actor = (id: string) => `${base}agents/${encodeURIComponent(id)}/`;
const exploration = (id: string) => `${base}explorations/${encodeURIComponent(id)}/`;
export const combatKey = () => crypto.randomUUID().replace(/-/g, '');
export const getCombatCatalog = (signal?: AbortSignal) => request.get<never, CombatCatalog>(`${base}catalog/`, {signal});
export const getCombatProfile = (id: string, signal?: AbortSignal) => request.get<never, CombatProfile>(actor(id), {signal});
export const getCombatHistory = (id: string, page: number, signal?: AbortSignal) => request.get<never, CombatHistory>(`${actor(id)}history/`, {params: {page}, signal});
export const getCombatConfig = (signal?: AbortSignal) => request.get<never, CombatConfig>(`${base}config/`, {signal});
export const setCombatConfig = (data: Partial<CombatConfig>, key = combatKey()) => request.post<never, CombatConfig>(`${base}config/`, {key, ...data});
export const combatCommand = <T = CombatProfile>(id: string, data: Record<string, unknown>, key = combatKey(), signal?: AbortSignal) => request.post<never, T>(actor(id), {key, ...data}, {signal});
export const getCombatSnapshot = (id: string, cursor: number, signal?: AbortSignal) => request.get<never, CombatSnapshot>(exploration(id), {params: {cursor}, signal});
export const explorationCommand = (id: string, operation: 'recall' | 'resume', key = combatKey()) => request.post<never, CombatSnapshot>(exploration(id), {key, operation});

export const previewCombatEquipment = (id: string, equipment: Record<string, string | null>, signal?: AbortSignal) => request.post<never, {attributes: Record<string, number | string>}>(actor(id), {key:combatKey(), operation:'preview_equip', equipment}, {signal});
