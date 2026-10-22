import request from '../utils/request';
import type {TournamentOverview, TournamentHistory, TournamentDetail, TournamentMatchDetail} from '../types/api/tournament';

const base = '/settings/agent-world/tournaments';
export const getTournamentOverview = (signal?: AbortSignal) => request.get<never, TournamentOverview>(`${base}/current/`, {signal});
export const getTournamentHistory = (page: number, signal?: AbortSignal) => request.get<never, TournamentHistory>(`${base}/`, {params: {page}, signal});
export const getTournament = (id: string, signal?: AbortSignal) => request.get<never, TournamentDetail>(`${base}/${encodeURIComponent(id)}/`, {signal});
export const getTournamentMatch = (id: string, matchId: string, signal?: AbortSignal) => request.get<never, TournamentMatchDetail>(
    `${base}/${encodeURIComponent(id)}/matches/${encodeURIComponent(matchId)}/`, {signal});
