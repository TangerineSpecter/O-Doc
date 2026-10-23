import request from '../utils/request';
import type {CookingRecipes, CookingHistory, RecipeRule} from '../types/api/cooking';
const base = '/settings/agent-world/cooking/';
export const getCookingRecipes = (agentId?: string, signal?: AbortSignal) =>
    request.get<never, CookingRecipes>(`${base}recipes/`, {params: {agentId}, signal});
export const updateCookingRecipe = (recipeId: string, rule: RecipeRule) =>
    request.patch<never, RecipeRule>(`${base}recipes/${encodeURIComponent(recipeId)}/`, rule);
export const getCookingHistory = (agentId: string, page: number, signal?: AbortSignal) =>
    request.get<never, CookingHistory>(`${base}agents/${encodeURIComponent(agentId)}/history/`, {params: {page}, signal});
