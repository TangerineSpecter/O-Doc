import request from '../utils/request';
import type {DiaryDraft, DiaryEntry} from '../types/api/diary';
export const listDiary = (signal?: AbortSignal) => request.get<unknown, DiaryEntry[]>('/diary/', {signal});
export const saveDiary = (draft: DiaryDraft, id?: string) => {
    const payload = {...draft, imageAssetIds: !draft.imageAssetIds.length && draft.coverUrl && !draft.coverAssetId ? undefined : draft.imageAssetIds, coverAssetId: !draft.coverAssetId && draft.coverUrl ? undefined : draft.coverAssetId};
    return id ? request.put<unknown, DiaryEntry>(`/diary/${id}`, payload) : request.post<unknown, DiaryEntry>('/diary/', payload);
};
export const deleteDiary = (id: string) => request.delete<unknown, void>(`/diary/${id}`);

export {uploadDiaryImage} from './diaryImage';
