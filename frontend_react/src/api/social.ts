import type {AIProvider} from '../types/api/setting';
import request from '../utils/request';
import type {Moment, MomentComment, SocialConfiguration, SocialNotification, SocialTheatreEvent} from '../types/api/social';
const base = '/settings/agent-world';
export const getMoments = (params: {actorId?: string; related?: string; before?: string}, signal?: AbortSignal) =>
    request.get<unknown, {moments: Moment[]; nextCursor: string | null}>(`${base}/moments/`, {params, signal});
export const getMoment = (id: string, signal?: AbortSignal) =>
    request.get<unknown, Moment>(`${base}/moments/${id}/`, {signal});
export const publishMoment = (content: string, images: string[]) => request.post<unknown, {moment: Moment}>(`${base}/moments/`, {content, images});
export const deleteMoment = (id: string) => request.delete(`${base}/moments/${id}/`);
export const likeMoment = (id: string, active: boolean) => request.post<unknown, Moment>(`${base}/moments/${id}/like/`, {active});
export const getMomentComments = (id: string) => request.get<unknown, {comments: MomentComment[]}>(`${base}/moments/${id}/comments/`);
export const addMomentComment = (id: string, content: string, parentId = '', replyToActorId = '') =>
    request.post<unknown, {comment: MomentComment}>(`${base}/moments/${id}/comments/`, {content, parentId, replyToActorId});
export const getSocialInbox = (signal?: AbortSignal) => request.get<unknown, {items: SocialNotification[]; unread: number}>(`${base}/social/inbox/`, {signal});
export const readSocialNotification = (id: string) => request.post(`${base}/social/inbox/${id}/read/`);
export const getSocialConfiguration = () => request.get<unknown, SocialConfiguration>(`${base}/social/config/`);
export const saveSocialConfiguration = (value: SocialConfiguration) => request.post<unknown, SocialConfiguration>(`${base}/social/config/`, value);
export const getSocialTheatreEvents = (before?: string) => request.get<unknown, {items: SocialTheatreEvent[]; nextCursor: string | null}>(`${base}/social/discussions/`, {params: before ? {before} : {}});
export const getSocialTheatreEvent = (id: string) => request.get<unknown, SocialTheatreEvent>(`${base}/social/discussions/${id}/`);
export const deleteSocialTheatreEvent = (id: string) => request.delete(`${base}/social/discussions/${id}/`);
export const triggerSocialTheatre = () => request.post<unknown, {event: SocialTheatreEvent}>(`${base}/social/discussions/trigger/`, {});
export const resumeSocialTheatre = (id: string) => request.post<unknown, {event: SocialTheatreEvent}>(`${base}/social/discussions/${id}/resume/`, {});
export const regenerateMomentImage = (id: string) => request.post<unknown, Moment>(`${base}/moments/${id}/regenerate/`);

export const getSocialImageProviders = () => request.get<unknown, AIProvider[]>('/settings/providers/');

export const recoverMomentImage = (id: string) => request.post<unknown, Moment>(`${base}/moments/${id}/recover-image/`);
