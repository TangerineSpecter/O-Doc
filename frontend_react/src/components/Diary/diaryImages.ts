import type {DiaryDraft} from '../../types/api/diary';
export const MAX_DIARY_IMAGES = 15;
export function diaryImagePatch(ids: string[]): Pick<DiaryDraft, 'imageAssetIds' | 'coverAssetId' | 'coverUrl'> {
    return {imageAssetIds: ids, coverAssetId: ids[0] || null, coverUrl: ids.length ? `/api/resource/view/${ids[0]}` : ''};
}
