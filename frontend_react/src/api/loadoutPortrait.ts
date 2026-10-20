import request from '@/utils/request';
import type {BattleAppearanceGenerationOptions, BattleAppearanceImageTask} from '@/types/api/setting';

export type PortraitTask = BattleAppearanceImageTask;
export interface PortraitOptions extends BattleAppearanceGenerationOptions {models: {value: string; label: string}[]}
export interface SavedPortrait {imageUrl: string; assetId: string; scale: number}
const url = (id: string) => `/settings/agents/${encodeURIComponent(id)}/loadout-portrait`;
export const getLoadoutPortrait = (id: string) => request.get<never, SavedPortrait>(`${url(id)}/`);
export const applyLoadoutPortrait = (id: string, data: {taskId?: string; scale: number}) => request.put<never, SavedPortrait>(`${url(id)}/`, data);
export const clearLoadoutPortrait = (id: string) => request.delete<never, SavedPortrait>(`${url(id)}/`);
export const getPortraitOptions = (id: string, modelId?: string) => request.get<never, PortraitOptions>(`${url(id)}-options/`, {params: {modelId}});
export const getPortraitTasks = (id: string) => request.get<never, PortraitTask[]>(`${url(id)}-generation/`);
export const queryPortraitTask = (id: string, taskId: string) => request.get<never, PortraitTask>(`${url(id)}-generation/`, {params: {taskId}, timeout: 60000});
export const cancelPortraitTask = (id: string, taskId: string) => request.delete<never, PortraitTask>(`${url(id)}-generation/`, {params: {taskId}});
export const generatePortrait = (id: string, data: {modelId?: string; prompt: string; requestId: string; referenceImageId?: string; aspectRatio?: string; imageSize?: string}) => request.post<never, PortraitTask>(`${url(id)}-generation/`, data, {timeout: 180000});
