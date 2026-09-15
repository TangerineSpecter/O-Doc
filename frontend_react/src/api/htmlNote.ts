import request from '../utils/request';
import type {Article} from '../types/api/article';

export const getHtmlPreview = async (articleId: string, signal?: AbortSignal): Promise<string> => {
    const blob = await request.get<unknown, Blob>(`/article/html-preview/${articleId}`, {responseType: 'blob', signal});
    return blob.text();
};
export const convertHtmlNote = (articleId: string) => request.post<unknown, Article>(`/article/html-convert/${articleId}`);
export const getHtmlDeletionSummary = (articleId: string) => request.get<unknown, {exclusiveCount: number; sharedCount: number}>(`/article/html-delete-summary/${articleId}`);
export const downloadHtmlSource = async (url: string, title: string) => {
    const blob = await request.get<unknown, Blob>(url.replace(/^\/api/, ''), {responseType: 'blob'});
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `${title}.${blob.type.includes('zip') ? 'zip' : 'html'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};
