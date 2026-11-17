import request from '../utils/request';
import type {VideoNoteJob} from '../types/api/videoNote';

const base = '/article/video-notes/jobs';

export const listVideoJobs = (collId: string): Promise<VideoNoteJob[]> =>
    request.get(base, {params: {collId}});

export const createVideoJob = (collId: string, shareText: string, requestId: string): Promise<VideoNoteJob> =>
    request.post(base, {collId, shareText, requestId});

export const retryVideoJob = (id: string): Promise<VideoNoteJob> => request.post(`${base}/${id}/retry`);

export const uploadVideo = (id: string, file: File): Promise<VideoNoteJob> => {
    const data = new FormData();
    data.append('file', file);
    return request.post(`${base}/${id}/upload`, data, {timeout: 600000});
};
