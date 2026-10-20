import request from '../utils/request';
import type {Bounty, BountyCreateInput, BountyListResult, BountyOptions, BountyStatus} from '../types/api/bounty';

const base = '/settings/agent-world/bounties';

export const getBounties = (params: {page?: number; status?: BountyStatus[]}, signal?: AbortSignal) =>
    request.get<never, BountyListResult>(`${base}/`, {
        params: {page: params.page || 1, status: (params.status || []).join(',')},
        signal,
    });

export const getBountyOptions = (signal?: AbortSignal) =>
    request.get<never, BountyOptions>(`${base}/options/`, {signal});

export const getBounty = (bountyId: string) =>
    request.get<never, Bounty>(`${base}/${bountyId}/`);

export const createBounty = (value: BountyCreateInput) =>
    request.post<never, {id: string; status: string; inviteAt: string}>(`${base}/`, value);

export const cancelBounty = (bountyId: string) =>
    request.post<never, Bounty>(`${base}/${bountyId}/`, {action: 'cancel'});

export const deleteBounty = (bountyId: string) =>
    request.post<never, {id: string; deleted: boolean}>(`${base}/${bountyId}/`, {action: 'delete'});

export const reviewBounty = (bountyId: string, approve: boolean, reason: string) =>
    request.post<never, Bounty>(`${base}/${bountyId}/`, {action: 'review', approve, reason});

export const reinviteBounty = (bountyId: string) =>
    request.post<never, Bounty>(`${base}/${bountyId}/`, {action: 'reinvite'});

export const runBountyNow = (bountyId: string) =>
    request.post<never, Bounty>(`${base}/${bountyId}/`, {action: 'run-now'});
