import request from '../utils/request';
import {getAuthToken} from '../utils/authStorage';

export interface Image {
  imageId: string;
  title: string;
  description?: string;
  imageUrl: string;
  collId: string;
  shootingTime?: string;
  shootingTimeStr?: string;
  country?: string;
  city?: string;
  placeName?: string;
  location?: string;
  locationId?: string;
  locationDetail?: {
    id: string;
    country: string;
    city: string;
    latitude: string;
    longitude: string;
  } | null;
  latitude?: string;
  longitude?: string;
  focalLength?: string;
  photoGroupId?: string;
  groupIndex?: number;
  tags?: string;
  tagsList?: string[];
  author?: string;
  authorNickname?: string;
  createdAt?: string;
  updatedAt?: string;
  isValid?: boolean;
  date?: string;
}

export interface CreateImageParams {
  title: string;
  description?: string;
  imageUrl: string;
  collId: string;
  shootingTime?: string;
  country?: string;
  city?: string;
  placeName?: string;
  locationId?: string;
  focalLength?: string;
  tags?: string;
}

export interface UpdateImageParams {
  title?: string;
  description?: string;
  imageUrl?: string;
  shootingTime?: string;
  country?: string;
  city?: string;
  placeName?: string;
  locationId?: string;
  focalLength?: string;
  tags?: string;
}

export interface GenerateImageDescriptionParams {
  title?: string;
  country?: string;
  city?: string;
  placeName?: string;
  imageUrl?: string;
  imageData?: string;
  imageFile?: File;
}

export interface GroupPhotoPayload {
  imageId?: string;
  imageUrl: string;
  focalLength?: string;
  groupIndex: number;
}

export interface ImageGroupPayload {
  collId: string;
  title: string;
  description?: string;
  shootingTime?: string;
  country?: string;
  city?: string;
  placeName?: string;
  locationId?: string;
  tags?: string;
  photos: GroupPhotoPayload[];
}

export const getImagesByAnthology = (collId: string) => {
  return request.get<any, Image[]>(`/article/image/list/${collId}`);
};

export const getImageDetail = (imageId: string) => {
  return request.get<any, Image>(`/article/image/detail/${imageId}`);
};

export const createImage = (data: CreateImageParams) => {
  return request.post<any, Image>('/article/image/create', data);
};

export const createImageGroup = (data: ImageGroupPayload) =>
  request.post<any, Image[]>('/article/image/group/create', data);

export const updateImageGroup = (groupId: string, data: Omit<ImageGroupPayload, 'collId'>) =>
  request.put<any, Image[]>(`/article/image/group/${groupId}`, data);

export const deleteImageGroup = (groupId: string) =>
  request.delete<any, void>(`/article/image/group/${groupId}/delete`);

export const updateImage = (imageId: string, data: UpdateImageParams) => {
  return request.put<any, Image>(`/article/image/update/${imageId}`, data);
};

export const generateImageDescription = async (data: GenerateImageDescriptionParams) => {
  const token = getAuthToken();
  const body = data.imageFile ? new FormData() : JSON.stringify(data);

  if (body instanceof FormData) {
    body.append('image', data.imageFile!);
    body.append('title', data.title || '');
    body.append('country', data.country || '');
    body.append('city', data.city || '');
    body.append('placeName', data.placeName || '');
    if (data.imageUrl) body.append('imageUrl', data.imageUrl);
  }

  const response = await fetch('/api/article/image/generate-description', {
    method: 'POST',
    headers: data.imageFile
      ? {...(token ? {Authorization: `Token ${token}`} : {})}
      : {
        'Content-Type': 'application/json',
        ...(token ? {Authorization: `Token ${token}`} : {}),
      },
    body,
    signal: AbortSignal.timeout(75000),
  });

  if (!response.ok) {
    throw new Error('AI 生成描述请求失败');
  }

  const result = await response.json();
  if (result.code !== 200) {
    throw new Error([result.msg, result.data].filter(Boolean).join(': ') || 'AI 生成描述失败');
  }

  return result.data as { description: string };
};

export const deleteImage = (imageId: string) => {
  return request.delete<any, void>(`/article/image/delete/${imageId}`);
};

export type ImageIndexStatus = 'unrecognized' | 'recognized' | 'indexed' | 'needs_recognition' | 'needs_index' | 'failed';
export interface ImageSearchItem { image: Image; matchReason: string }
export interface ImageSearchResponse { items: ImageSearchItem[]; page?: number; hasMore?: boolean; semanticAvailable?: boolean }
export interface ImageIndexJob {
  id: string;
  state: 'queued' | 'running' | 'completed' | 'cancelled';
  mode: 'reuse' | 'refresh' | 'index_only';
  total: number;
  completed: number;
  failed: number;
  failures: Record<string, string>;
  cancelRequested: boolean;
}
export interface ImageIndexSummary { total: number; indexed: number; statuses: Record<string, ImageIndexStatus>; job: ImageIndexJob | null; canManage: boolean }
export interface ImageVisualDetail { aiDescription: string; override: string; status: ImageIndexStatus; model: string; error: string }

export const searchImages = (query: string, collId?: string, page = 1) =>
  request.post<any, ImageSearchResponse>('/article/image/search', {query, collId, page, pageSize: 30}, {timeout: 45000});

export const searchImagesByReference = (image: File, collId?: string) => {
  const body = new FormData();
  body.append('image', image);
  if (collId) body.append('coll_id', collId);
  return request.post<any, ImageSearchResponse>('/article/image/search-by-image', body, {timeout: 120000});
};

export const getSimilarImages = (imageId: string) =>
  request.get<any, ImageSearchResponse>(`/article/image/similar/${imageId}`);

export const getImageIndexStatus = (collId: string) =>
  request.get<any, ImageIndexSummary>(`/article/image/index-status/${collId}`);

export const getImageVisualDetail = (imageId: string) =>
  request.get<any, ImageVisualDetail>(`/article/image/visual/${imageId}`);

export const updateImageVisualDescription = (imageId: string, override: string) =>
  request.put<any, {status: ImageIndexStatus}>(`/article/image/visual/${imageId}`, {override});

export const createImageIndexJob = (collId: string, imageIds: string[] | 'all', mode: ImageIndexJob['mode'] = 'reuse') =>
  request.post<any, ImageIndexJob>('/article/image/index-jobs', {collId, imageIds, mode});

export const getImageIndexJobs = (collId: string) =>
  request.get<any, ImageIndexJob[]>('/article/image/index-jobs', {params: {collId}});

export const cancelImageIndexJob = (jobId: string) =>
  request.post<any, ImageIndexJob>(`/article/image/index-jobs/${jobId}/cancel`);

export const removeImageIndexes = (collId: string, imageIds: string[]) =>
  request.post<any, {removed: number}>('/article/image/index-remove', {collId, imageIds});
