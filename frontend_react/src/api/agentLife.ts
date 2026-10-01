import request from '../utils/request';
import type {LifeConfig, LifeSettings, LifeProfile, LifeGoal, LifeItem, LifeSchedule} from '../types/api/agentLife';
const base = '/settings/agent-world/life';
export const getLifeConfig = (signal?: AbortSignal) => request.get<never, LifeConfig>(`${base}/config/`, {signal});
export const saveLifeConfig = (settings: LifeSettings) => request.post<never, LifeConfig>(`${base}/config/`, {settings});
export const getLifeProfile = (actor: string, signal?: AbortSignal) => request.get<never, LifeProfile>(`${base}/profiles/${actor}/`, {signal});
export const saveLifeProfile = (actor: string, value: Pick<LifeProfile, 'preferences' | 'direction'>) => request.post<never, LifeProfile>(`${base}/profiles/${actor}/`, value);
export const getLifeGoals = (actorId?: string, signal?: AbortSignal, page = 1) => request.get<never, LifeGoal[]>(`${base}/goals/`, {params: {actorId, page}, signal});
export const saveLifeGoal = (value: Partial<LifeGoal>) => request.post<never, {id: string}>(`${base}/goals/`, value);
export const getLifeSchedule = (params: {start: string; end: string; actorId?: string; status?: string; page?: number}, signal?: AbortSignal) => request.get<never, LifeSchedule>(`${base}/schedule/`, {params, signal});
export const getLifeItem = (id: string, signal?: AbortSignal) => request.get<never, LifeItem>(`${base}/schedule/${id}/`, {signal});
export const changeLifeItem = (id: string, action: 'cancel' | 'replan' | 'retry', reason: string) => request.post<never, LifeItem>(`${base}/schedule/${id}/`, {action, reason});
export const replanFailedLifeItems = (actorId: string, reason: string, start: string, end: string) =>
    request.post<never, {count: number}>(`${base}/schedule/`, {action: 'replan_failed', actorId, reason, start, end});
export const pauseLifeAgent = (actorId: string, paused: boolean) => request.post<never, {pausedAgents: string[]}>(`${base}/schedule/`, {actorId, action: paused ? 'pause' : 'resume'});
export const getLifeAgents = (signal?: AbortSignal) => request.get<never, import('../types/api/setting').AgentConfig[]>('/settings/agents/', {signal});
export const runLifeActivity = (taskId: string, actorId: string) => request.post(`/settings/agent-tasks/${taskId}/run_now/`, {actorId});

export const getLifeGoalOptions = (signal?: AbortSignal, q = '', destinationId = '') => request.get<never, {destinations: {id: string; city: string; country: string}[]; items: {sku: string; name: string}[]}>(`${base}/goals/`, {params: {options: '1', q, destinationId}, signal});
