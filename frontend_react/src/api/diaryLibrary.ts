import request from '../utils/request';
import type {DiaryLibraryResponse} from '../types/api/diary';
export const getDiaryPhotoLibrary = (collId = '', keyword = '', page = 1, signal?: AbortSignal) =>
    request.get<unknown, DiaryLibraryResponse>('/diary/photo-library', {params: {collId, keyword, page}, signal});
