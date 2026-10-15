import request from '../utils/request';
import type {DecisionConfig, DecisionConnectionInput} from '../types/api/decision';

export const getDecisionConfig = (signal?: AbortSignal) =>
    request.get<unknown, DecisionConfig>('/settings/decision-models/', {signal});
export const saveDecisionKey = (apiKey: string | null) =>
    request.patch<unknown, DecisionConfig>('/settings/decision-models/', {apiKey});
export const createDecisionConnection = (value: DecisionConnectionInput) =>
    request.post<unknown, DecisionConfig>('/settings/decision-models/connections/', value);
export const updateDecisionConnection = (id: string, value: Partial<DecisionConnectionInput>) =>
    request.patch<unknown, DecisionConfig>(`/settings/decision-models/connections/${encodeURIComponent(id)}/`, value);
export const deleteDecisionConnection = (id: string) =>
    request.delete<unknown, DecisionConfig>(`/settings/decision-models/connections/${encodeURIComponent(id)}/`);
export const testDecisionConnection = (id = 'jev') =>
    request.post<unknown, {ok: boolean}>(id === 'jev'
        ? '/settings/decision-models/test/'
        : `/settings/decision-models/connections/${encodeURIComponent(id)}/test/`, undefined, {timeout: 75000});
