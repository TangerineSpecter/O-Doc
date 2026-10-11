import request from '@/utils/request';
export interface PostPhotoState {status?: string; canManage?: boolean; error?: string; imageUrl?: string; assetId?: string; attempt?: number}
const path = (id: string) => `/settings/agent-world/posts/${id}/photo/`;
export const getPostPhoto = (id: string, signal?: AbortSignal) => request.get<never, PostPhotoState>(path(id), {signal});
export const operatePostPhoto = (id: string, action: 'query' | 'retry' | 'use_image') => request.post<never, PostPhotoState>(path(id), {action, confirmCharge: action === 'retry'});
