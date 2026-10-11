import request from '@/utils/request';
export interface PostPhotoState {status?: string; canManage?: boolean; hasImage?: boolean; error?: string; imageUrl?: string; assetId?: string; attempt?: number; stage?: string; elapsedSeconds?: number; lastUpdatedAt?: string; canRetryDownload?: boolean; recovering?: boolean; retryAfterSeconds?: number}
export type PostPhotoAction = 'generate' | 'query' | 'retry' | 'use_image' | 'remove';
const path = (id: string) => `/settings/agent-world/posts/${id}/photo/`;
export const getPostPhoto = (id: string, signal?: AbortSignal) => request.get<never, PostPhotoState>(path(id), {signal});
export const operatePostPhoto = (id: string, action: PostPhotoAction) => request.post<never, PostPhotoState>(path(id), {action, confirmCharge: ['generate', 'retry'].includes(action)}, {timeout: action === 'query' ? 120000 : 10000});
