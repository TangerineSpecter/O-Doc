import request from '../utils/request';
import type {BlacksmithHistory, BlacksmithRecipe, BlacksmithRecipes, BlacksmithRulePatch} from '../types/api/blacksmith';

const base = '/settings/agent-world/blacksmith/';
export const getBlacksmithRecipes = (agentId?: string, signal?: AbortSignal) =>
    request.get<never, BlacksmithRecipes>(`${base}recipes/`, {params: {agentId}, signal});
export const updateBlacksmithRecipe = (id: string, rule: BlacksmithRulePatch) =>
    request.patch<never, BlacksmithRecipe>(`${base}recipes/${encodeURIComponent(id)}/`, rule);
export const getBlacksmithHistory = (agentId: string, page = 1, signal?: AbortSignal) =>
    request.get<never, BlacksmithHistory>(`${base}agents/${encodeURIComponent(agentId)}/history/`, {params: {page}, signal});
