import request from '../utils/request';
import type {InvestmentDecision, InvestmentDetail, InvestmentOverview, InvestmentPage, InvestmentPosition, InvestmentResident, InvestmentTrade} from '../types/api/investment';
const base = '/settings/agent-world/investment';
export const getInvestmentResidents = (signal?: AbortSignal) => request.get<never, InvestmentResident[]>(`${base}/accounts/`, {signal});
export const getInvestmentOverview = (actorId: string, signal?: AbortSignal) => request.get<never, InvestmentOverview>(`${base}/overview/`, {signal, params: {actor_id: actorId}});
export const getInvestmentPositions = (actorId: string, page: number, signal?: AbortSignal) => request.get<never, InvestmentPage<InvestmentPosition>>(`${base}/positions/`, {signal, params: {actor_id: actorId, page}});
export const getInvestmentTrades = (actorId: string, page: number, signal?: AbortSignal) => request.get<never, InvestmentPage<InvestmentTrade>>(`${base}/trades/`, {signal, params: {actor_id: actorId, page}});
export const getInvestmentDecisions = (actorId: string, page: number, signal?: AbortSignal) => request.get<never, InvestmentPage<InvestmentDecision>>(`${base}/decisions/`, {signal, params: {actor_id: actorId, page}});
// Cold BaoStock queries are bounded to 120 seconds by the detail endpoint.
export const getInvestmentDetail = (actorId: string, code: string, signal?: AbortSignal) => request.get<never, InvestmentDetail>(`${base}/detail/`, {signal, timeout: 150_000, params: {actor_id: actorId, code}});
