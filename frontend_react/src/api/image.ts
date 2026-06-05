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

export const getImagesByAnthology = (collId: string) => {
  return request.get<any, Image[]>(`/article/image/list/${collId}`);
};

export const getImageDetail = (imageId: string) => {
  return request.get<any, Image>(`/article/image/detail/${imageId}`);
};

export const createImage = (data: CreateImageParams) => {
  return request.post<any, Image>('/article/image/create', data);
};

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
