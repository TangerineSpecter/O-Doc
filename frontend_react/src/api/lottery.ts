import request from '../utils/request';
import type {LotteryConfig, LotteryOverview, LotteryPage, LotteryRound, LotteryTicket} from '../types/api/lottery';
const base = '/settings/agent-world/lottery';
export const getLotteryConfig = (signal?: AbortSignal) => request.get<never, LotteryConfig>(`${base}/config/`, {signal});
export const saveLotteryConfig = (enabled: boolean) => request.post<never, LotteryConfig>(`${base}/config/`, {enabled});
export const getLotteryOverview = (roundId: string, signal?: AbortSignal) => request.get<never, LotteryOverview>(
    roundId ? `${base}/rounds/${encodeURIComponent(roundId)}/` : `${base}/current/`, {signal});
export const getLotteryRounds = (page: number, signal?: AbortSignal) => request.get<never, LotteryPage<LotteryRound>>(`${base}/rounds/`, {params: {page}, signal});
export const getLotteryTickets = (roundId: string, page: number, signal?: AbortSignal) => request.get<never, LotteryPage<LotteryTicket>>(
    `${base}/rounds/${encodeURIComponent(roundId)}/tickets/`, {params: {page}, signal});
