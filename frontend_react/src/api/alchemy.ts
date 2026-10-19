import request from '../utils/request';
import type {AlchemyRecipes, AlchemySkill, AlchemyHistory, AlchemyRule} from '../types/api/alchemy';
const base = '/settings/agent-world/alchemy/';
export const getAlchemyRecipes = (agentId?: string, signal?: AbortSignal) =>
    request.get<never, AlchemyRecipes>(`${base}recipes/`, {params: {agentId}, signal});
export const updateAlchemyRecipe = (recipeId: string, rule: AlchemyRule) =>
    request.patch<never, AlchemyRule>(`${base}recipes/${encodeURIComponent(recipeId)}/`, rule);
export const getAlchemySkill = (agentId: string, signal?: AbortSignal) =>
    request.get<never, AlchemySkill>(`${base}agents/${encodeURIComponent(agentId)}/`, {signal});
export const getAlchemyHistory = (agentId: string, page: number, signal?: AbortSignal) =>
    request.get<never, AlchemyHistory>(`${base}agents/${encodeURIComponent(agentId)}/history/`, {params: {page}, signal});
