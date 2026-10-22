import request from '../utils/request';

export interface WorldStaminaSettings {
    recoveryPerHour: number;
    maxStamina: number;
}
const url = '/settings/agent-world/stamina/config/';
export const getWorldStaminaSettings = (signal?: AbortSignal) =>
    request.get<never, WorldStaminaSettings>(url, {signal});
export const saveWorldStaminaSettings = (recoveryPerHour: number) =>
    request.post<never, WorldStaminaSettings>(url, {recoveryPerHour});
