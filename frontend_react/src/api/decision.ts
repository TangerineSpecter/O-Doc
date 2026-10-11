import request from '../utils/request';
import type {DecisionConfig} from '../types/api/decision';

export const getDecisionConfig = (signal?: AbortSignal) =>
    request.get<unknown, DecisionConfig>('/settings/decision-models/', {signal});
export const saveDecisionKey = (apiKey: string | null) =>
    request.patch<unknown, DecisionConfig>('/settings/decision-models/', {apiKey});
export const testDecisionConnection = () =>
    request.post<unknown, {ok: boolean}>('/settings/decision-models/test/', undefined, {timeout: 12000});
