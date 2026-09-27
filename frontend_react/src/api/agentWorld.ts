import request from '../utils/request';
import type { WorldCategory, WorldProfession, WorldIncomeConfig, WorldRanking, WorldLedger, WorldSettlement, MigrationPreview, WorldPendingIncome } from '../types/api/agentWorld';
const base = '/settings/agent-world';
export const getWorldFinanceLedger = (
    agentId?: string,
    signal?: AbortSignal,
) => request.get<never, WorldLedger[]>(
    base + '/ledger/',
    {params: {agentId, direction: 'flow'}, signal},
);
export const getWorldCategories = () => request.get<never, WorldCategory[]>(`${base}/categories/`);
export const saveWorldCategory = (value: Partial<WorldCategory>) => request.post<never, WorldCategory>(`${base}/categories/`, value);
export const getWorldProfessions = () => request.get<never, WorldProfession[]>(`${base}/professions/`);
export const saveWorldProfession = (value: Partial<WorldProfession>) => request.post<never, WorldProfession>(`${base}/professions/`, value);
export const getWorldIncome = () => request.get<never, WorldIncomeConfig>(`${base}/income/`);
export const saveWorldIncome = (value: WorldIncomeConfig) => request.post<never, WorldIncomeConfig>(`${base}/income/`, value);
export const getWorldLedger = () => request.get<never, WorldLedger[]>(`${base}/ledger/`);
export const getWorldSettlements = () => request.get<never, WorldSettlement[]>(`${base}/settlements/`);
export const getWorldRanking = (collectionId: string, period: string, value: string) => request.get<never, WorldRanking>(`${base}/collections/${collectionId}/ranking/`, { params: { period, value } });
export const previewWorldMigration = (collectionId: string, oldCategory: string, postId?: string) => request.get<never, MigrationPreview>(`${base}/collections/${collectionId}/migration/`, { params: { oldCategory, postId } });
export const migrateWorldCategory = (collectionId: string, oldCategory: string, categoryId: string, token: string, postId?: string) => request.post(`${base}/collections/${collectionId}/migration/`, { oldCategory, categoryId, token, postId });

export const getWorldPendingIncome = () => request.get<never, WorldPendingIncome[]>(`${base}/pending-income/`);
