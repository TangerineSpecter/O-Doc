import request from '../utils/request';

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
  locationId?: string;
  focalLength?: string;
  tags?: string;
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

export const deleteImage = (imageId: string) => {
  return request.delete<any, void>(`/article/image/delete/${imageId}`);
};
