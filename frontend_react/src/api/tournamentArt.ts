import request from '@/utils/request';

export interface ArtMoment {id: string; round: number; actor: string; target: string; action: string; damage: number; critical: boolean}
export interface ArtTask {taskId?: string; status: string; assetId?: string; message?: string}
export interface TournamentArtData {
    assetId: string; task: ArtTask | null; moments: ArtMoment[]; canGenerate: boolean;
    options: {configured: boolean; message?: string; modelId?: string; supportsReferenceImages?: boolean; models: {value: string; label: string}[]};
}
const path = (id: string) => `/settings/agent-world/tournaments/${encodeURIComponent(id)}/illustration/`;
export const getTournamentArt = (id: string, modelId = '', poll = false) =>
    request.get<never, TournamentArtData>(path(id), {params: {modelId, poll: poll ? '1' : '0'}, timeout: 60000});
export const generateTournamentArt = (id: string, data: {modelId: string; momentId: string; prompt: string; styleReferenceImageId?: string}) =>
    request.post<never, ArtTask>(path(id), data, {timeout: 180000});
export const applyTournamentArt = (id: string, data: {assetId?: string; taskId?: string}) =>
    request.put<never, {assetId: string}>(path(id), data);
export const releaseTournamentArt = (id: string) => request.delete<never, object>(path(id));
